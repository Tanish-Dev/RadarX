/** News watcher: poll public RSS/Atom feeds, place each headline on the map, group the same story across outlets. */
import pLimit from "p-limit";
import { FEEDS, isIndiaPlace, type Feed } from "../data/news";
import { db, kvGet, kvSet } from "../lib/db";
import { HttpError, USER_AGENT } from "../lib/http";
import { clusterNews, locate, newsId, parseFeed, topicsFor, type FeedItem } from "../lib/news";

/** Bump when the gazetteer or topic rules change → every stored story is re-placed and re-tagged. */
export const NEWS_GEO_VERSION = 3;
const INTERVAL_MS = (Number(process.env.NEWS_INTERVAL_MIN) || 10) * 60_000;
const KEEP_DAYS = 14;
const H = 3_600_000;

export interface NewsCheck {
  id: string;
  ok: boolean;
  fetched: number;
  added: number;
  unchanged?: boolean;
  error?: string;
}

/** GET with If-None-Match / If-Modified-Since so unchanged feeds cost a 304. */
async function fetchFeed(f: Feed): Promise<FeedItem[] | null> {
  const cache = (await kvGet<{ etag?: string; lm?: string }>(`news_http:${f.id}`)) ?? {};
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch(f.url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5",
        ...(cache.etag ? { "If-None-Match": cache.etag } : {}),
        ...(cache.lm ? { "If-Modified-Since": cache.lm } : {}),
      },
    });
    if (res.status === 304) return null;
    if (!res.ok) throw new HttpError(res.status, f.url);
    const items = parseFeed(await res.text());
    const etag = res.headers.get("etag") ?? undefined, lm = res.headers.get("last-modified") ?? undefined;
    if (etag || lm) await kvSet(`news_http:${f.id}`, { etag, lm });
    return items;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkNews(opts: { force?: boolean; minGapMs?: number } = {}): Promise<NewsCheck[] | null> {
  const now = Date.now();
  const last = (await kvGet<number>("news_checked_at")) ?? 0;
  if (!opts.force && now - last < (opts.minGapMs ?? INTERVAL_MS)) return null;
  await kvSet("news_checked_at", now);
  const c = await db();
  const limit = pLimit(6);

  const rows = await Promise.all(
    FEEDS.map((f) =>
      limit(async (): Promise<NewsCheck> => {
        try {
          const items = await fetchFeed(f);
          if (!items) return { id: f.id, ok: true, fetched: 0, added: 0, unchanged: true };
          const fresh = items
            .slice(0, 60)
            .map((it) => ({ ...it, publishedAt: it.publishedAt == null ? null : Math.min(it.publishedAt, now) }))
            .filter((it) => (it.publishedAt ?? now) > now - 7 * 24 * H);
          if (!fresh.length) return { id: f.id, ok: true, fetched: items.length, added: 0 };
          const ids = fresh.map((it) => newsId(it.url));
          const knownRows = (await c.execute({ sql: `SELECT id, title, points FROM news WHERE id IN (${ids.map(() => "?").join(",")})`, args: ids })).rows;
          const known = new Set(knownRows.map((r) => String(r.id)));
          const sig = new Map(knownRows.map((r) => [String(r.id), `${r.title}|${r.points ?? ""}`]));
          // write only new stories and ones whose headline / HN points changed
          const todo = fresh.map((it, i) => ({ it, id: ids[i] })).filter(({ it, id }) => sig.get(id) !== `${it.title.slice(0, 300)}|${it.points ?? ""}`);
          if (todo.length) await c.batch(
            todo.map(({ it, id }) => {
              const loc = locate(it.title, it.summary, f.kind);
              const india = loc ? loc.india : !!f.india;
              return {
                sql: `INSERT INTO news (id, source, kind, title, url, summary, image, published_at, first_seen_at, place, lat, lon, india, topics, points)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                      ON CONFLICT(id) DO UPDATE SET title = excluded.title, summary = excluded.summary,
                        image = COALESCE(excluded.image, news.image), points = COALESCE(excluded.points, news.points),
                        place = excluded.place, lat = excluded.lat, lon = excluded.lon, india = excluded.india, topics = excluded.topics`,
                args: [
                  id, f.id, f.kind, it.title.slice(0, 300), it.url, it.summary || null, it.image, it.publishedAt, now,
                  loc?.place ?? null, loc?.lat ?? null, loc?.lon ?? null, india || isIndiaPlace(loc?.place) ? 1 : 0,
                  JSON.stringify(topicsFor(f.kind, it.title, it.summary, it.categories)), it.points,
                ],
              };
            }),
            "write",
          );
          return { id: f.id, ok: true, fetched: items.length, added: ids.filter((id) => !known.has(id)).length };
        } catch (e) {
          const error = e instanceof HttpError ? `HTTP ${e.status}` : e instanceof Error ? (e.name === "AbortError" ? "timeout" : e.message) : String(e);
          return { id: f.id, ok: false, fetched: 0, added: 0, error };
        }
      }),
    ),
  );

  if ((await kvGet<number>("news_geo_version")) !== NEWS_GEO_VERSION) {
    await relocateAll();
    await kvSet("news_geo_version", NEWS_GEO_VERSION);
  }
  await c.execute({ sql: `DELETE FROM news WHERE COALESCE(published_at, first_seen_at) < ?`, args: [now - KEEP_DAYS * 24 * H] });
  await recluster(now);
  await kvSet("news_status", Object.fromEntries(rows.map((r) => [r.id, { ok: r.ok, error: r.error ?? null, at: now }])));
  return rows;
}

/** Re-run place + topic detection on every stored story. */
export async function relocateAll() {
  const c = await db();
  const feeds = new Map(FEEDS.map((f) => [f.id, f]));
  const r = await c.execute(`SELECT id, source, kind, title, summary FROM news`);
  const stmts = r.rows.map((x) => {
    const kind = String(x.kind) as Feed["kind"], title = String(x.title), summary = String(x.summary ?? "");
    const loc = locate(title, summary, kind);
    const india = loc ? loc.india : !!feeds.get(String(x.source))?.india;
    return {
      sql: `UPDATE news SET place = ?, lat = ?, lon = ?, india = ?, topics = ? WHERE id = ?`,
      args: [loc?.place ?? null, loc?.lat ?? null, loc?.lon ?? null, india ? 1 : 0, JSON.stringify(topicsFor(kind, title, summary)), String(x.id)],
    };
  });
  for (let i = 0; i < stmts.length; i += 400) await c.batch(stmts.slice(i, i + 400), "write");
}

/** Recompute story clusters + coverage (distinct outlets) for the last 3 days. */
export async function recluster(now = Date.now()) {
  const c = await db();
  const r = await c.execute({
    sql: `SELECT id, source, kind, title, cluster, coverage, COALESCE(published_at, first_seen_at) AS ts FROM news WHERE COALESCE(published_at, first_seen_at) >= ?`,
    args: [now - 72 * H],
  });
  const items = r.rows.map((x) => ({ id: String(x.id), source: String(x.source), kind: String(x.kind) as Feed["kind"], title: String(x.title), ts: Number(x.ts) }));
  const cl = clusterNews(items);
  const srcById = new Map(items.map((i) => [i.id, i.source]));
  const outlets = new Map<string, Set<string>>();
  for (const [id, root] of cl) {
    // BBC World + BBC Tech, or The Hindu's two feeds, are one outlet
    const outlet = srcById.get(id)!.replace(/-(world|tech|intl|nat)$/, "");
    (outlets.get(root) ?? outlets.set(root, new Set()).get(root)!).add(outlet);
  }
  const cur = new Map(r.rows.map((x) => [String(x.id), `${x.cluster}|${x.coverage}`]));
  const stmts = [...cl]
    .filter(([id, root]) => cur.get(id) !== `${root}|${outlets.get(root)!.size}`) // only rows whose cluster changed
    .map(([id, root]) => ({ sql: `UPDATE news SET cluster = ?, coverage = ? WHERE id = ?`, args: [root, outlets.get(root)!.size, id] }));
  for (let i = 0; i < stmts.length; i += 400) await c.batch(stmts.slice(i, i + 400), "write");
}
