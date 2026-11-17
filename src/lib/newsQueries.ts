/** Server reads for tech & world news (Home briefing, /news, the map's news layer). */
import "server-only";
import { FEEDS, type NewsKind } from "../data/news";
import { db, kvGet } from "./db";
import { storyScore, topicLabel } from "./news";
import { ago, agoShort } from "./time";

const H = 3_600_000;
const FEED = new Map(FEEDS.map((f) => [f.id, f]));

export interface NewsItem {
  id: string;
  kind: NewsKind;
  title: string;
  url: string;
  summary: string;
  image: string | null;
  source: string;
  sourceName: string;
  domain: string;
  ts: number;
  ago: string;
  agoShort: string;
  place: string | null;
  lat: number | null;
  lon: number | null;
  india: boolean;
  topics: { id: string; label: string }[];
  /** distinct outlets carrying this story */
  coverage: number;
  outlets: string[];
  points: number | null;
  score: number;
}

export interface NewsFilters {
  kind?: NewsKind;
  topic?: string;
  india?: boolean;
  place?: string;
  q?: string;
  hours?: number;
  sort?: "top" | "latest";
}

type Row = Record<string, unknown>;

/** One item per story: the member with an image and the longest summary represents the cluster. */
function toStories(rows: Row[], now: number): NewsItem[] {
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const k = String(r.cluster ?? r.id);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
  }
  const out: NewsItem[] = [];
  for (const members of groups.values()) {
    const rep = [...members].sort(
      (a, b) => Number(b.image != null) - Number(a.image != null) || String(b.summary ?? "").length - String(a.summary ?? "").length,
    )[0];
    const ts = Math.min(...members.map((m) => Number(m.ts)));
    const placed = members.find((m) => m.place != null) ?? rep;
    const outlets = [...new Set(members.map((m) => FEED.get(String(m.source))?.name.replace(/ · .*$/, "") ?? String(m.source)))];
    const coverage = Math.max(outlets.length, ...members.map((m) => Number(m.coverage ?? 1)));
    const points = Math.max(0, ...members.map((m) => Number(m.points ?? 0))) || null;
    const f = FEED.get(String(rep.source));
    const topics = [...new Set(members.flatMap((m) => JSON.parse(String(m.topics ?? "[]")) as string[]))].slice(0, 3);
    out.push({
      id: String(rep.id),
      kind: String(rep.kind) as NewsKind,
      title: String(rep.title),
      url: String(rep.url),
      summary: String(rep.summary ?? ""),
      image: rep.image == null ? null : String(rep.image),
      source: String(rep.source),
      sourceName: f?.name ?? String(rep.source),
      domain: f?.domain ?? "",
      ts,
      ago: ago(ts, now),
      agoShort: agoShort(ts, now),
      place: placed.place == null ? null : String(placed.place),
      lat: placed.lat == null ? null : Number(placed.lat),
      lon: placed.lon == null ? null : Number(placed.lon),
      india: members.some((m) => Number(m.india) === 1),
      topics: topics.map((id) => ({ id, label: topicLabel(id) })),
      coverage,
      outlets,
      points,
      score: storyScore(coverage, points, (now - ts) / H),
    });
  }
  return out;
}

async function loadStories(hours: number, now = Date.now()): Promise<NewsItem[]> {
  const c = await db();
  const r = await c.execute({
    sql: `SELECT id, source, kind, title, url, summary, image, COALESCE(published_at, first_seen_at) AS ts, place, lat, lon, india, topics, points, cluster, coverage
          FROM news WHERE COALESCE(published_at, first_seen_at) >= ? ORDER BY ts DESC LIMIT 3000`,
    args: [now - hours * H],
  });
  return toStories(r.rows as Row[], now);
}

export async function getNews(f: NewsFilters = {}, limit = 60): Promise<{ items: NewsItem[]; total: number; topics: { id: string; label: string; n: number }[] }> {
  const all = await loadStories(f.hours ?? 72);
  const q = f.q?.toLowerCase().trim();
  const base = all.filter(
    (s) =>
      (!f.kind || s.kind === f.kind) &&
      (!f.india || s.india) &&
      (!f.place || s.place === f.place) &&
      (!q || s.title.toLowerCase().includes(q) || s.summary.toLowerCase().includes(q)),
  );
  const counts = new Map<string, { id: string; label: string; n: number }>();
  for (const s of base) for (const t of s.topics) (counts.get(t.id) ?? counts.set(t.id, { ...t, n: 0 }).get(t.id)!).n++;
  const items = base.filter((s) => !f.topic || s.topics.some((t) => t.id === f.topic));
  items.sort(f.sort === "latest" ? (a, b) => b.ts - a.ts : (a, b) => b.score - a.score);
  return { items: items.slice(0, limit), total: items.length, topics: [...counts.values()].sort((a, b) => b.n - a.n) };
}

export interface NewsPoint {
  place: string;
  lat: number;
  lon: number;
  count: number;
  kind: NewsKind | "mixed";
  india: boolean;
  /** biggest story first */
  items: { title: string; source: string; ago: string; coverage: number; kind: NewsKind }[];
  newestMinutes: number;
}

/** Stories of the last `hours`, grouped by place, for the map's news layer. */
export async function getNewsPoints(hours = 48, f: { kind?: NewsKind; india?: boolean; topic?: string } = {}): Promise<NewsPoint[]> {
  const now = Date.now();
  const stories = (await loadStories(hours, now)).filter(
    (s) => s.lat != null && s.lon != null && (!f.kind || s.kind === f.kind) && (!f.india || s.india) && (!f.topic || s.topics.some((t) => t.id === f.topic)),
  );
  const byPlace = new Map<string, NewsItem[]>();
  for (const s of stories) (byPlace.get(s.place!) ?? byPlace.set(s.place!, []).get(s.place!)!).push(s);
  return [...byPlace.entries()]
    .map(([place, list]) => {
      list.sort((a, b) => b.score - a.score);
      const kinds = new Set(list.map((s) => s.kind));
      return {
        place,
        lat: list[0].lat!,
        lon: list[0].lon!,
        count: list.length,
        kind: kinds.size > 1 ? "mixed" : list[0].kind,
        india: list.some((s) => s.india),
        items: list.slice(0, 3).map((s) => ({ title: s.title, source: s.sourceName, ago: s.agoShort, coverage: s.coverage, kind: s.kind })),
        newestMinutes: Math.round((now - Math.max(...list.map((s) => s.ts))) / 60_000),
      } satisfies NewsPoint;
    })
    .sort((a, b) => b.count - a.count);
}

/** Home briefing: top tech, top world, India, and job-market signals (layoffs / hiring / funding). */
export async function getBriefing() {
  const stories = await loadStories(48);
  const top = (xs: NewsItem[], n: number) => [...xs].sort((a, b) => b.score - a.score).slice(0, n);
  const signals = stories.filter((s) => s.kind === "tech" && s.topics.some((t) => t.id === "layoffs" || t.id === "hiring" || t.id === "funding"));
  const checked = await kvGet<number>("news_checked_at");
  return {
    tech: top(stories.filter((s) => s.kind === "tech"), 8),
    world: top(stories.filter((s) => s.kind === "world"), 8),
    india: top(stories.filter((s) => s.india), 8),
    signals: top(signals, 5),
    ticker: top(stories, 10),
    counts: {
      tech: stories.filter((s) => s.kind === "tech").length,
      world: stories.filter((s) => s.kind === "world").length,
      layoffs: signals.filter((s) => s.topics.some((t) => t.id === "layoffs")).length,
      funding: signals.filter((s) => s.topics.some((t) => t.id === "funding")).length,
      hiring: signals.filter((s) => s.topics.some((t) => t.id === "hiring")).length,
    },
    checkedAt: checked ?? null,
  };
}
