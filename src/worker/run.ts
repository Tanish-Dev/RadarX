import { createHash } from "node:crypto";
import type { InStatement } from "@libsql/client";
import pLimit from "p-limit";
import { db, kvGet, kvSet } from "../lib/db";
import { HttpError } from "../lib/http";
import { atsIdFromUrl, companyKey, dedupeKey } from "../lib/normalize";
import { dispatchAlerts, type DispatchResult } from "../alerts/dispatch";
import { classifyPending, rescoreIfProfileChanged } from "../lib/jobs";
import { checkNews, type NewsCheck } from "./news";
import { checkStocks } from "./stocks";
import { checkPrograms, sendProgramAlerts, type ProgramCheck } from "./programs";
import { ENRICHABLE, fetchDetail, fetchSource } from "../sources/fetchers";
import type { RawJob } from "../sources/types";
import { loadSources, runDiscovery, syncRegistry, type SourceRow } from "./registry";

export interface SourceResult {
  key: string;
  name: string;
  ats: string;
  ok: boolean;
  unchanged?: boolean;
  fetched: number;
  newJobs: number;
  seededNow: boolean;
  ms: number;
  error?: string;
}

export interface RunSummary {
  startedAt: number;
  finishedAt: number;
  results: SourceResult[];
  newJobs: number;
  discovered: number;
  unresolved: number;
  classified: number;
  alerts: DispatchResult;
  programs: ProgramCheck[] | null;
  news: NewsCheck[] | null;
  programAlerts: number;
}

const INACTIVE_AFTER_MISSES = 3;
const MAX_ENRICH_PER_SOURCE = 25;
const HOUR = 3_600_000;
/** Search-based sources return a relevance-ranked slice, so a job can drop out without closing. */
const SEARCH_ATS = new Set(["workday", "eightfold", "oracle", "amazon"]);
const SEARCH_INACTIVE_AFTER_MS = 3 * 24 * HOUR;
/**
 * A posting we haven't seen before only counts as alertable if the source says it
 * was posted recently (or doesn't say). Stops old roles that resurface in a search
 * slice from being alerted as "new".
 */
export const FRESH_WINDOW_MS = (Number(process.env.FRESH_WINDOW_HOURS) || 72) * HOUR;

function errMsg(e: unknown): string {
  if (e instanceof HttpError) return `HTTP ${e.status}`;
  if (e instanceof Error) return e.name === "AbortError" ? "timeout (20s)" : e.message;
  return String(e);
}

/**
 * Per-source "seen" state, kept in ONE kv row so a poll doesn't have to read (or rewrite) every
 * stored posting — on a hosted DB (Turso) rows read/written are the billed resource.
 *   id → [fingerprint, lastSeenAt (ms, refreshed at most daily), misses, active (1/0)]
 */
type Seen = Record<string, [string, number, number, 0 | 1]>;
const SEEN_REFRESH_MS = 24 * HOUR;

// postedAt is left out on purpose: Workday says "Posted 2 days ago", so the parsed timestamp drifts every
// run — and the stored posted_at never changes after insert anyway (COALESCE in the upsert)
const fingerprint = (j: RawJob) =>
  createHash("sha1")
    .update([j.title, j.location, j.url, j.description?.length ?? 0, j.category ?? "", j.stipend ?? "", j.deadline ?? "", j.logo ?? ""].join("|"))
    .digest("base64")
    .slice(0, 12);

async function loadSeen(srcKey: string): Promise<Seen> {
  const cached = await kvGet<Seen>(`seen:${srcKey}`);
  if (cached) return cached;
  // first run after the upgrade (or a new source): build it from the jobs table once
  const c = await db();
  const r = await c.execute({ sql: `SELECT id, last_seen_at, active FROM jobs WHERE source = ?`, args: [srcKey] });
  const out: Seen = {};
  for (const row of r.rows) out[String(row.id)] = ["", Number(row.last_seen_at ?? 0), 0, Number(row.active) ? 1 : 0];
  return out;
}

/**
 * Store one source's fetch. Writes only: new postings, changed postings, a once-a-day "still listed"
 * touch, and deactivations. Returns ids that are new and alertable.
 */
async function storeJobs(src: SourceRow, jobs: RawJob[], now: number): Promise<string[]> {
  const c = await db();
  const seen = await loadSeen(src.key);
  const isAggregate = src.kind === "aggregate";
  const silent = !src.seeded; // seeding rule: first successful fetch never alerts
  const newIds: string[] = [];
  const fetched = new Set<string>();
  const stmts: InStatement[] = [];
  const debugWhy: string[] = [];
  let changed = false;

  for (const j of jobs) {
    if (!j.externalId || !j.title || !j.url) continue;
    const id = `${src.key}:${j.externalId}`;
    if (fetched.has(id)) continue;
    fetched.add(id);
    const fp = fingerprint(j);
    const prev = seen[id];
    if (prev && prev[3] === 1 && prev[0] === fp && prev[2] === 0 && now - prev[1] < SEEN_REFRESH_MS) continue; // unchanged, seen recently
    if (prev && prev[3] === 1 && prev[0] === fp && now - prev[1] < SEEN_REFRESH_MS) {
      seen[id] = [fp, prev[1], 0, 1]; // back after a miss — only the kv state changes
      changed = true;
      continue;
    }
    if (process.env.RADAR_DEBUG_WRITES && debugWhy.length < 3) debugWhy.push(!prev ? "new" : prev[3] !== 1 ? "reactivated" : prev[0] !== fp ? `fp ${prev[0]}→${fp}` : `refresh ${Math.round((now - prev[1]) / 60000)}m`);
    const stale = j.postedAt != null && now - j.postedAt > FRESH_WINDOW_MS;
    if (!prev && !stale && !silent) newIds.push(id);
    seen[id] = [fp, now, 0, 1];
    changed = true;
    const company = isAggregate ? j.company : src.name;
    stmts.push({
      sql: `INSERT INTO jobs (id, source, company_key, company, title, location, url, description, posted_at,
              first_seen_at, last_seen_at, category, notified, alert_status, dedupe_key, ext_id, url_id, stipend, deadline, logo)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              last_seen_at = excluded.last_seen_at, missed_runs = 0, active = 1, inactive_at = NULL,
              title = excluded.title, location = excluded.location, url = excluded.url,
              description = CASE WHEN excluded.description != '' THEN excluded.description ELSE jobs.description END,
              posted_at = COALESCE(jobs.posted_at, excluded.posted_at),
              category = COALESCE(excluded.category, jobs.category),
              stipend = COALESCE(excluded.stipend, jobs.stipend), deadline = COALESCE(excluded.deadline, jobs.deadline),
              logo = COALESCE(excluded.logo, jobs.logo)`,
      args: [
        id, src.key, isAggregate ? companyKey(j.company) : src.key, company, j.title, j.location, j.url, j.description, j.postedAt,
        now, now, j.category ?? null, silent || stale ? 1 : 0, silent ? "seed" : stale ? "stale" : null,
        dedupeKey(company, j.title, j.location), j.externalId, isAggregate ? atsIdFromUrl(j.url) : null,
        j.stipend ?? null, j.deadline ?? null, j.logo ?? null,
      ],
    });
  }

  // anything active but not in this fetch gets a strike (kept in kv, not the DB); 3 strikes → inactive.
  // Search-based sources must also have been unseen for 3 days (relevance-ranked slices drop roles).
  const searchBased = SEARCH_ATS.has(src.config!.ats);
  const deactivate: string[] = [];
  for (const [id, st] of Object.entries(seen)) {
    if (st[3] !== 1 || fetched.has(id)) continue;
    const misses = st[2] + 1;
    const gone = misses >= INACTIVE_AFTER_MISSES && (!searchBased || now - st[1] > SEARCH_INACTIVE_AFTER_MS);
    seen[id] = [st[0], st[1], misses, gone ? 0 : 1];
    changed = true;
    if (gone) deactivate.push(id);
  }
  for (let i = 0; i < deactivate.length; i += 400) {
    const ids = deactivate.slice(i, i + 400);
    stmts.push({ sql: `UPDATE jobs SET active = 0, inactive_at = ?, missed_runs = ? WHERE id IN (${ids.map(() => "?").join(",")})`, args: [now, INACTIVE_AFTER_MISSES, ...ids] });
  }
  if (process.env.RADAR_DEBUG_WRITES && stmts.length > 20) console.log(`[writes] ${src.key}: ${stmts.length} (${debugWhy.slice(0, 3).join(" | ")})`);
  for (let i = 0; i < stmts.length; i += 250) await c.batch(stmts.slice(i, i + 250), "write");
  if (changed) await kvSet(`seen:${src.key}`, seen);
  return newIds;
}

/** 304 Not Modified: every stored posting is still listed — touch last_seen_at at most once a day. */
async function markAllSeen(src: SourceRow, now: number) {
  const seen = await loadSeen(src.key);
  const touch: string[] = [];
  for (const [id, st] of Object.entries(seen)) {
    if (st[3] !== 1) continue;
    if (st[2] !== 0 || now - st[1] >= SEEN_REFRESH_MS) {
      if (now - st[1] >= SEEN_REFRESH_MS) touch.push(id);
      seen[id] = [st[0], now - st[1] >= SEEN_REFRESH_MS ? now : st[1], 0, 1];
    }
  }
  const c = await db();
  for (let i = 0; i < touch.length; i += 400) {
    const ids = touch.slice(i, i + 400);
    await c.execute({ sql: `UPDATE jobs SET last_seen_at = ?, missed_runs = 0 WHERE id IN (${ids.map(() => "?").join(",")})`, args: [now, ...ids] });
  }
  if (touch.length || Object.values(seen).some((st) => st[3] === 1 && st[2] !== 0)) await kvSet(`seen:${src.key}`, seen);
}

/** Write the source's status row only when something a reader would notice changed (or every 30 min). */
async function touchSource(src: SourceRow, now: number, fields: { jobCount?: number }) {
  const prevOk = src.last_ok ?? 0;
  const statusChanged = src.status !== "ok" || !src.seeded;
  const countChanged = fields.jobCount != null && fields.jobCount !== src.job_count;
  if (!statusChanged && !countChanged && now - prevOk < 30 * 60_000) return;
  const c = await db();
  await c.execute({
    sql: `UPDATE sources SET status='ok', last_ok=?, last_run=?, last_error=NULL, job_count=COALESCE(?, job_count), seeded=1 WHERE key=?`,
    args: [now, now, fields.jobCount ?? null, src.key],
  });
}

/** Fetch descriptions (and real posted dates) for new postings from list APIs that omit them. */
async function enrich(src: SourceRow, ids: string[], now: number) {
  const c = await db();
  const limit = pLimit(3);
  await Promise.all(
    ids.slice(0, MAX_ENRICH_PER_SOURCE).map((id) =>
      limit(async () => {
        const row = (await c.execute({ sql: `SELECT url FROM jobs WHERE id = ?`, args: [id] })).rows[0];
        if (!row) return;
        try {
          const d = await fetchDetail(src.config!, { externalId: id.slice(src.key.length + 1), url: String(row.url) });
          if (!d) return;
          const stale = d.postedAt != null && now - d.postedAt > FRESH_WINDOW_MS;
          await c.execute({
            sql: `UPDATE jobs SET description = ?, posted_at = COALESCE(?, posted_at), enriched = 1, classifier_version = 0,
                    notified = CASE WHEN ? THEN 1 ELSE notified END,
                    alert_status = CASE WHEN ? THEN 'stale' ELSE alert_status END
                  WHERE id = ?`,
            args: [d.description, d.postedAt ?? null, stale ? 1 : 0, stale ? 1 : 0, id],
          });
        } catch {
          /* keep the title-only posting; it can still alert */
        }
      }),
    ),
  );
}

/**
 * Give a Simplify row the dedupe_key of the direct-ATS posting its apply URL points at,
 * so the pair counts as one role in lists and alerts.
 */
export async function linkAggregateDuplicates(opts: { full?: boolean } = {}): Promise<number> {
  const c = await db();
  const now = Date.now();
  const full = opts.full ?? now - ((await kvGet<number>("link_full_at")) ?? 0) > 24 * HOUR;
  if (full) {
    // daily: backfill url_id for old rows + relink everything
    const missing = await c.execute(`SELECT id, url FROM jobs WHERE source LIKE 'simplify-%' AND url_id IS NULL LIMIT 20000`);
    const stmts = missing.rows
      .map((r) => ({ id: String(r.id), u: atsIdFromUrl(String(r.url)) }))
      .map((x) => ({ sql: `UPDATE jobs SET url_id = ? WHERE id = ?`, args: [x.u ?? "", x.id] }));
    for (let i = 0; i < stmts.length; i += 500) await c.batch(stmts.slice(i, i + 500), "write");
    const r = await c.execute(
      `UPDATE jobs SET dedupe_key = (SELECT d.dedupe_key FROM jobs d WHERE d.ext_id = jobs.url_id AND d.source NOT LIKE 'simplify-%' LIMIT 1)
       WHERE source LIKE 'simplify-%' AND url_id != ''
         AND EXISTS (SELECT 1 FROM jobs d WHERE d.ext_id = jobs.url_id AND d.source NOT LIKE 'simplify-%' AND d.dedupe_key != jobs.dedupe_key)`,
    );
    await kvSet("link_full_at", now);
    return r.rowsAffected;
  }
  // every run: only pairs where one side arrived since the last pass (index lookups, no table scan)
  const since = ((await kvGet<number>("link_at")) ?? now - 2 * 24 * HOUR) - HOUR;
  await kvSet("link_at", now);
  const fresh = await c.execute({ sql: `SELECT id, source, ext_id, url_id, dedupe_key FROM jobs WHERE first_seen_at >= ?`, args: [since] });
  const isAgg = (src: string) => src.startsWith("simplify-");
  const direct = fresh.rows.filter((r) => !isAgg(String(r.source)) && r.ext_id);
  const agg = fresh.rows.filter((r) => isAgg(String(r.source)) && r.url_id);
  const stmts: InStatement[] = [];
  const inList = (n: number) => Array.from({ length: n }, () => "?").join(",");
  for (let i = 0; i < direct.length; i += 400) {
    const part = direct.slice(i, i + 400);
    const key = new Map(part.map((r) => [String(r.ext_id), String(r.dedupe_key)]));
    const m = await c.execute({ sql: `SELECT id, url_id, dedupe_key FROM jobs WHERE url_id IN (${inList(part.length)}) AND source LIKE 'simplify-%'`, args: part.map((r) => String(r.ext_id)) });
    for (const r of m.rows) {
      const k = key.get(String(r.url_id));
      if (k && k !== String(r.dedupe_key)) stmts.push({ sql: `UPDATE jobs SET dedupe_key = ? WHERE id = ?`, args: [k, String(r.id)] });
    }
  }
  for (let i = 0; i < agg.length; i += 400) {
    const part = agg.slice(i, i + 400);
    const m = await c.execute({ sql: `SELECT ext_id, dedupe_key FROM jobs WHERE ext_id IN (${inList(part.length)}) AND source NOT LIKE 'simplify-%'`, args: part.map((r) => String(r.url_id)) });
    const key = new Map(m.rows.map((r) => [String(r.ext_id), String(r.dedupe_key)]));
    for (const r of part) {
      const k = key.get(String(r.url_id));
      if (k && k !== String(r.dedupe_key)) stmts.push({ sql: `UPDATE jobs SET dedupe_key = ? WHERE id = ?`, args: [k, String(r.id)] });
    }
  }
  for (let i = 0; i < stmts.length; i += 250) await c.batch(stmts.slice(i, i + 250), "write");
  return stmts.length;
}

/**
 * Fetch descriptions for early-career tech postings that were stored without one
 * (a source's silent first import skips enrichment). A few dozen per run.
 */
export async function enrichBacklog(limit: number): Promise<number> {
  if (limit <= 0) return 0;
  const c = await db();
  const sources = new Map((await loadSources()).filter((s) => s.config && ENRICHABLE.has(s.config.ats)).map((s) => [s.key, s]));
  if (!sources.size) return 0;
  const keys = [...sources.keys()];
  const r = await c.execute({
    sql: `SELECT id, source, url FROM jobs WHERE enriched = 0 AND description = '' AND active = 1 AND is_tech = 1
            AND level IN ('intern','newgrad','research') AND source IN (${keys.map(() => "?").join(",")})
          ORDER BY first_seen_at DESC LIMIT ?`,
    args: [...keys, limit],
  });
  const lim = pLimit(4);
  let done = 0;
  await Promise.all(
    r.rows.map((row) =>
      lim(async () => {
        const src = sources.get(String(row.source))!;
        const id = String(row.id);
        try {
          const d = await fetchDetail(src.config!, { externalId: id.slice(src.key.length + 1), url: String(row.url) });
          await c.execute({
            sql: `UPDATE jobs SET description = ?, posted_at = COALESCE(posted_at, ?), enriched = 1, classifier_version = 0 WHERE id = ?`,
            args: [d?.description ?? "", d?.postedAt ?? null, id],
          });
          done++;
        } catch {
          await c.execute({ sql: `UPDATE jobs SET enriched = -1 WHERE id = ?`, args: [id] }); // don't retry forever
        }
      }),
    ),
  );
  return done;
}

async function runSource(src: SourceRow, now: number): Promise<SourceResult> {
  const c = await db();
  const t0 = Date.now();
  const base = { key: src.key, name: src.name, ats: src.config!.ats, fetched: 0, newJobs: 0, seededNow: false };
  try {
    const out = await fetchSource(src.config!, {
      company: src.name,
      now,
      getEtag: () => kvGet<string>(`etag:${src.key}`),
      setEtag: (e) => kvSet(`etag:${src.key}`, e),
      cacheGet: <T,>(k: string) => kvGet<T>(`cache:${src.key}:${k}`),
      cacheSet: (k, v) => kvSet(`cache:${src.key}:${k}`, v),
    });
    if (out.unchanged) {
      // nothing changed upstream: every stored job is still listed
      await markAllSeen(src, now);
      await touchSource(src, now, {});
      return { ...base, ok: true, unchanged: true, ms: Date.now() - t0 };
    }
    const newIds = await storeJobs(src, out.jobs, now);
    if (newIds.length && ENRICHABLE.has(src.config!.ats)) await enrich(src, newIds, now);
    await touchSource(src, now, { jobCount: out.jobs.length });
    return { ...base, ok: true, fetched: out.jobs.length, newJobs: newIds.length, seededNow: !src.seeded, ms: Date.now() - t0 };
  } catch (e) {
    const error = errMsg(e);
    await c.execute({ sql: `UPDATE sources SET status='error', last_run=?, last_error=? WHERE key=?`, args: [now, error, src.key] });
    return { ...base, ok: false, error, ms: Date.now() - t0 };
  }
}

export async function runOnce(opts: { only?: string[] } = {}): Promise<RunSummary> {
  const startedAt = Date.now();
  const c = await db();
  const runId = Number(
    (await c.execute({ sql: `INSERT INTO runs (started_at) VALUES (?) RETURNING id`, args: [startedAt] })).rows[0].id,
  );

  await syncRegistry();
  const disc = await runDiscovery({ now: startedAt });

  let sources = (await loadSources()).filter((s) => s.config);
  if (opts.only?.length) sources = sources.filter((s) => opts.only!.some((k) => s.key.includes(k) || s.config!.ats === k));

  const limit = pLimit(Number(process.env.POLL_CONCURRENCY) || 8);
  const results = await Promise.all(sources.map((s) => limit(() => runSource(s, startedAt))));

  await linkAggregateDuplicates();
  // the backlog query scans; every 3 h is plenty (new postings are enriched as they arrive)
  let enrichedBacklog = 0;
  if (Date.now() - ((await kvGet<number>("enrich_backlog_at")) ?? 0) > 3 * HOUR) {
    enrichedBacklog = await enrichBacklog(Number(process.env.ENRICH_PER_RUN) || 60);
    await kvSet("enrich_backlog_at", Date.now());
  }
  const classified = await classifyPending();
  await rescoreIfProfileChanged();
  const alerts = await dispatchAlerts();
  const programs = await checkPrograms().catch(() => null);
  const programAlerts = await sendProgramAlerts().catch(() => 0);
  const news = await checkNews().catch(() => null);
  await checkStocks().catch(() => null);

  const finishedAt = Date.now();
  const newJobs = results.reduce((n, r) => n + r.newJobs, 0);
  const errors = results.filter((r) => !r.ok).length;
  await c.execute({
    sql: `UPDATE runs SET finished_at=?, new_jobs=?, alerted=?, errors=?, sources_ok=?, summary=? WHERE id=?`,
    args: [
      finishedAt,
      newJobs,
      alerts.sent + alerts.overflow,
      errors,
      results.length - errors,
      JSON.stringify({ discovered: disc.resolved.length, unresolved: disc.unresolved.length, alerts }),
      runId,
    ],
  });
  return { startedAt, finishedAt, results, newJobs, discovered: disc.resolved.length, unresolved: disc.unresolved.length, classified, alerts, programs, programAlerts, news };
}
