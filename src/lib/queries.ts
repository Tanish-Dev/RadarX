/** Server-side reads for the dashboard. Server components call these directly. */
import "server-only";
import { geocode } from "../data/cities";
import { AGGREGATE_SQL } from "../data/companies";
import { PROGRAMS, type Program } from "../data/programs";
import { programStatus, windowLabel, type StatusInfo } from "./programs";
import { db, kvGet } from "./db";
import { WITHIN_MS, type JobFilters } from "./filters";
import { companyKey } from "./normalize";
import { cached } from "./cache";
import { scoreJob, type Profile } from "./score";
import { getProfile } from "./settings";
import { ago, agoShort } from "./time";

/**
 * "When was this posted" for ranking/freshness: the source's posted date when known;
 * else when we first saw it — except rows from a source's silent first import, which
 * would otherwise all look brand new.
 */
export const FRESH_TS = `(CASE WHEN posted_at IS NOT NULL THEN posted_at WHEN alert_status = 'seed' THEN NULL ELSE first_seen_at END)`;

export interface JobRow {
  id: string;
  title: string;
  company: string;
  domain: string | null;
  logo: string | null;
  stipend: string | null;
  deadline: number | null;
  url: string;
  location: string;
  level: string | null;
  region: string | null;
  workplace: "Remote" | "Hybrid" | "On-site" | null;
  score: number | null;
  freshTs: number | null;
  ago: string;
  agoShort: string;
  isNew: boolean;
  starred: boolean;
  status: string | null;
  skills: string[];
  matched: string[];
}

export interface JobDetail extends JobRow {
  description: string;
  source: string;
  sourceName: string;
  postedAt: number | null;
  firstSeenAt: number;
  alertedAt: number | null;
  alertStatus: string | null;
  missing: string[];
  category: string | null;
  appliedAt: number | null;
}

// ── company → domain (for logos) ────────────────────────────────────────────
let domainCache: { at: number; map: Map<string, string> } | null = null;
async function domainMap(): Promise<Map<string, string>> {
  if (domainCache && Date.now() - domainCache.at < 60_000) return domainCache.map;
  const c = await db();
  const r = await c.execute(`SELECT key, name, domain FROM sources WHERE domain IS NOT NULL AND kind != 'aggregate'`);
  const map = new Map<string, string>();
  for (const row of r.rows) {
    map.set(String(row.key), String(row.domain));
    map.set(companyKey(String(row.name)), String(row.domain));
  }
  domainCache = { at: Date.now(), map };
  return map;
}

function workplace(location: string): JobRow["workplace"] {
  if (/hybrid/i.test(location)) return "Hybrid";
  if (/remote|anywhere/i.test(location)) return "Remote";
  return location ? "On-site" : null;
}

const NEW_MS = 3_600_000;

/** A visitor sees no owner state (stars, pipeline, owner-resume scores); `profile` = their own skills, if any. */
export interface ViewerScope {
  owner: boolean;
  profile: Profile | null;
}

function toRow(r: any, domains: Map<string, string>, mySkills: Set<string>, now: number, visitor?: ViewerScope): JobRow {
  const skills: string[] = JSON.parse(String(r.skills ?? "[]"));
  const freshTs = r.fresh_ts == null ? null : Number(r.fresh_ts);
  const visitorScore =
    visitor && visitor.profile
      ? scoreJob({ skills, titleSkills: JSON.parse(String(r.title_skills ?? "[]")), level: r.level ?? null, region: r.region ?? null, is_tech: Number(r.is_tech) === 1 }, visitor.profile)?.score ?? null
      : null;
  return {
    id: String(r.id),
    title: String(r.title),
    company: String(r.company),
    domain: domains.get(String(r.company_key)) ?? domains.get(companyKey(String(r.company))) ?? null,
    logo: r.logo == null ? null : String(r.logo),
    stipend: r.stipend == null ? null : String(r.stipend),
    deadline: r.deadline == null ? null : Number(r.deadline),
    url: String(r.url),
    location: String(r.location ?? ""),
    level: r.level == null ? null : String(r.level),
    region: r.region == null ? null : String(r.region),
    workplace: workplace(String(r.location ?? "")),
    score: visitor ? visitorScore : r.score == null ? null : Number(r.score),
    freshTs,
    ago: freshTs ? ago(freshTs, now) : "earlier",
    agoShort: freshTs ? agoShort(freshTs, now) : "–",
    isNew: freshTs != null && now - freshTs < NEW_MS,
    starred: visitor ? false : Number(r.starred) === 1,
    status: visitor ? null : r.status == null ? null : String(r.status),
    skills,
    matched: skills.filter((s) => mySkills.has(s)),
  };
}

const LIST_COLS = `id, title, company, company_key, url, location, level, region, score, skills, title_skills, is_tech, starred, status, logo, stipend, deadline, ${FRESH_TS} AS fresh_ts`;

/** libSQL rows → plain objects (cacheable). */
const plain = (r: { columns: string[]; rows: any[] }) => r.rows.map((row) => Object.fromEntries(r.columns.map((c, i) => [c, row[i]])));

const readJobRows = cached("jobRows", async (sql: string, args: (string | number)[], order: string, limit: number, offset: number) => {
  const c = await db();
  const [rows, total] = await Promise.all([
    c.execute({ sql: `SELECT ${LIST_COLS} FROM jobs WHERE ${sql} ORDER BY ${order} LIMIT ? OFFSET ?`, args: [...args, limit, offset] }),
    c.execute({ sql: `SELECT COUNT(*) AS n FROM jobs WHERE ${sql}`, args }),
  ]);
  return { rows: plain(rows), total: Number(total.rows[0].n) };
});

/**
 * One row per role: hide a posting when another active copy with the same dedupe_key
 * is preferred (direct ATS over the Simplify list, then earliest seen).
 */
export const ONE_PER_ROLE = `NOT EXISTS (SELECT 1 FROM jobs d WHERE d.dedupe_key = jobs.dedupe_key AND d.id != jobs.id AND d.active = 1 AND d.dismissed = 0
  AND (${AGGREGATE_SQL("d.source")} < ${AGGREGATE_SQL("jobs.source")}
    OR (${AGGREGATE_SQL("d.source")} = ${AGGREGATE_SQL("jobs.source")} AND (d.first_seen_at < jobs.first_seen_at OR (d.first_seen_at = jobs.first_seen_at AND d.id < jobs.id)))))`;

function where(f: Partial<JobFilters>, now: number, hidden: string[]) {
  const w: string[] = ["active = 1", "dismissed = 0", ONE_PER_ROLE];
  const a: (string | number)[] = [];
  if (f.tech !== false) w.push("is_tech = 1");
  if (f.level?.length) {
    w.push(`level IN (${f.level.map(() => "?").join(",")})`);
    a.push(...f.level);
  }
  if (f.region?.length) {
    const regions = f.region.map((r) => (r === "abroad" ? "global" : r));
    w.push(`region IN (${regions.map(() => "?").join(",")})`);
    a.push(...regions);
  }
  if (f.domain?.length) {
    w.push(`domain IN (${f.domain.map(() => "?").join(",")})`);
    a.push(...f.domain);
  }
  if (f.group) {
    w.push(`(company_key IN (SELECT key FROM sources WHERE grp = ?) OR company IN (SELECT name FROM sources WHERE grp = ?))`);
    a.push(f.group, f.group);
  }
  if (f.company) {
    w.push(`(company_key = ? OR company = ?)`);
    a.push(f.company, f.company);
  }
  if (f.q) {
    w.push(`(title LIKE ? OR company LIKE ?)`);
    a.push(`%${f.q}%`, `%${f.q}%`);
  }
  if (f.loc) {
    const parts = f.loc.split("|").filter(Boolean);
    w.push(`(${parts.map(() => "location LIKE ?").join(" OR ")})`);
    a.push(...parts.map((p) => `%${p}%`));
  }
  if (f.within) {
    w.push(`${FRESH_TS} >= ?`);
    a.push(now - WITHIN_MS[f.within]);
  }
  if (hidden.length) {
    w.push(`company_key NOT IN (${hidden.map(() => "?").join(",")})`);
    a.push(...hidden);
  }
  return { sql: w.join(" AND "), args: a };
}

export const PAGE_SIZE = 100;

/** Candidate pool a visitor's "best match" ranking is computed over (newest first). */
const VISITOR_MATCH_POOL = 600;

/**
 * Job list. Without `viewer` (or for the owner) it is the owner's view: DB scores from the owner's resume and
 * the owner's stars. For a visitor, owner state is stripped and "match" ranks the newest postings by the
 * visitor's own skills.
 */
export async function getJobs(f: Partial<JobFilters>, opts: { limit?: number; offset?: number } = {}, viewer?: ViewerScope) {
  // whole-minute "now" so identical requests share a cache entry
  const now = Math.floor(Date.now() / 60_000) * 60_000;
  const visitor = viewer && !viewer.owner ? viewer : undefined;
  const [domains, ownerProfile, hidden] = await Promise.all([domainMap(), visitor ? Promise.resolve(null) : getProfile(), kvGet<string[]>("hidden_companies")]);
  const profile = visitor ? visitor.profile : ownerProfile;
  const { sql, args } = where(f, now, hidden ?? []);
  const byFresh = `fresh_ts IS NULL, fresh_ts DESC, first_seen_at DESC`;
  const limit = Math.min(opts.limit ?? PAGE_SIZE, 200);
  const offset = opts.offset ?? ((f.page ?? 1) - 1) * limit;
  const mine = new Set(profile?.skills ?? []);

  if (visitor && f.sort === "match" && visitor.profile) {
    const pool = await readJobRows(sql, args, byFresh, VISITOR_MATCH_POOL, 0);
    const rows = pool.rows.map((r) => toRow(r, domains, mine, Date.now(), visitor)).sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || (b.freshTs ?? 0) - (a.freshTs ?? 0));
    return { jobs: rows.slice(offset, offset + limit), total: Math.min(pool.total, pool.rows.length), hasResume: true };
  }
  const order = !visitor && f.sort === "match" ? `score IS NULL, score DESC, fresh_ts IS NULL, fresh_ts DESC` : byFresh;
  const { rows, total } = await readJobRows(sql, args, order, limit, offset);
  return {
    jobs: rows.map((r) => toRow(r, domains, mine, Date.now(), visitor)),
    total,
    hasResume: (profile?.skills.length ?? 0) > 0,
  };
}

export async function getJob(id: string, viewer?: ViewerScope): Promise<JobDetail | null> {
  const c = await db();
  const r = await c.execute({
    sql: `SELECT j.*, ${FRESH_TS} AS fresh_ts, s.name AS source_name FROM jobs j LEFT JOIN sources s ON s.key = j.source WHERE j.id = ?`,
    args: [id],
  });
  const row: any = r.rows[0];
  if (!row) return null;
  const visitor = viewer && !viewer.owner ? viewer : undefined;
  const [domains, ownerProfile] = await Promise.all([domainMap(), visitor ? Promise.resolve(null) : getProfile()]);
  const profile = visitor ? visitor.profile : ownerProfile;
  const base = toRow(row, domains, new Set(profile?.skills ?? []), Date.now(), visitor);
  const s = profile
    ? scoreJob({ skills: base.skills, titleSkills: JSON.parse(String(row.title_skills ?? "[]")), level: row.level, region: row.region, is_tech: Number(row.is_tech) === 1 }, profile)
    : null;
  return {
    ...base,
    description: String(row.description ?? ""),
    source: String(row.source),
    sourceName: String(row.source_name ?? row.source),
    postedAt: row.posted_at == null ? null : Number(row.posted_at),
    firstSeenAt: Number(row.first_seen_at),
    // the owner's alert history and applications are private
    alertedAt: visitor || row.alerted_at == null ? null : Number(row.alerted_at),
    alertStatus: visitor || row.alert_status == null ? null : String(row.alert_status),
    missing: s?.missing ?? [],
    category: row.category == null ? null : String(row.category),
    appliedAt: visitor || row.applied_at == null ? null : Number(row.applied_at),
  };
}

// ── Home stats ──────────────────────────────────────────────────────────────
const H = 3_600_000;
const D = 24 * H;

async function getHomeStatsRaw() {
  const c = await db();
  const now = Date.now();
  const q = async (sql: string, args: (string | number)[] = []) => (await c.execute({ sql, args })).rows;
  const fresh = `is_tech = 1 AND ${FRESH_TS}`;

  const [today, hourly, week, prev4, active, lastHour, lastRun] = await Promise.all([
    q(
      `SELECT level, SUM(CASE WHEN ${FRESH_TS} >= ? THEN 1 ELSE 0 END) AS cur, SUM(CASE WHEN ${FRESH_TS} < ? THEN 1 ELSE 0 END) AS prev
       FROM jobs WHERE ${fresh} >= ? AND level IN ('intern','newgrad') GROUP BY level`,
      [now - D, now - D, now - 2 * D],
    ),
    q(`SELECT CAST((? - ${FRESH_TS}) / ${H} AS INTEGER) AS h, COUNT(*) AS n FROM jobs WHERE ${fresh} >= ? GROUP BY h`, [now, now - 12 * H]),
    q(`SELECT COUNT(*) AS n FROM jobs WHERE ${fresh} >= ?`, [now - 7 * D]),
    q(`SELECT COUNT(*) AS n FROM jobs WHERE ${fresh} >= ? AND ${FRESH_TS} < ?`, [now - 35 * D, now - 7 * D]),
    q(`SELECT COUNT(*) AS n FROM jobs WHERE active = 1 AND is_tech = 1`),
    q(`SELECT COUNT(*) AS n FROM jobs WHERE active = 1 AND is_tech = 1 AND ${FRESH_TS} >= ?`, [now - H]),
    q(`SELECT finished_at, (SELECT MIN(started_at) FROM runs) AS since FROM runs WHERE finished_at IS NOT NULL ORDER BY id DESC LIMIT 1`),
  ]);
  // day-over-day deltas need a full previous day of collection
  const since = lastRun[0]?.since == null ? now : Number(lastRun[0].since);
  const haveHistory = now - since >= 2 * D;
  const lvl = (l: string) => today.find((r) => r.level === l);
  const pct = (cur: number, prev: number) => (haveHistory && prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null);
  const intern = Number(lvl("intern")?.cur ?? 0), internPrev = Number(lvl("intern")?.prev ?? 0);
  const newgrad = Number(lvl("newgrad")?.cur ?? 0), newgradPrev = Number(lvl("newgrad")?.prev ?? 0);
  const bars = Array.from({ length: 12 }, (_, i) => Number(hourly.find((r) => Number(r.h) === 11 - i)?.n ?? 0));
  const weekN = Number(week[0].n), avg4 = Number(prev4[0].n) / 4;

  // sparkline: active tech postings by fresh day, last 9 days
  const spark = await q(
    `SELECT CAST((? - ${FRESH_TS}) / ${D} AS INTEGER) AS d, COUNT(*) AS n FROM jobs WHERE ${fresh} >= ? GROUP BY d`,
    [now, now - 9 * D],
  );
  return {
    intern,
    internDelta: pct(intern, internPrev),
    newgrad,
    newgradDelta: pct(newgrad, newgradPrev),
    hourly: bars,
    momentum: avg4 > 0 ? weekN / avg4 : null,
    weekN,
    active: Number(active[0].n),
    lastHour: Number(lastHour[0].n),
    spark: Array.from({ length: 9 }, (_, i) => Number(spark.find((r) => Number(r.d) === 8 - i)?.n ?? 0)),
    lastSync: lastRun[0]?.finished_at == null ? null : Number(lastRun[0].finished_at),
  };
}

async function getVolumeRaw(days = 30) {
  const c = await db();
  const now = Date.now();
  const r = await c.execute({
    sql: `SELECT CAST((? - ${FRESH_TS}) / ${D} AS INTEGER) AS d, COUNT(*) AS n,
            SUM(CASE WHEN level = 'intern' THEN 1 ELSE 0 END) AS intern
          FROM jobs WHERE is_tech = 1 AND ${FRESH_TS} >= ? GROUP BY d`,
    args: [now, now - days * D],
  });
  return Array.from({ length: days }, (_, i) => {
    const d = days - 1 - i;
    const row = r.rows.find((x) => Number(x.d) === d);
    const date = new Date(now - d * D);
    return { label: date.toLocaleDateString("en-IN", { day: "numeric", month: "short" }), n: Number(row?.n ?? 0), intern: Number(row?.intern ?? 0) };
  });
}

/** Alert latency: posted (or first seen) → alerted, for alerts in the last 7 days. */
async function getFreshnessRaw() {
  const c = await db();
  const r = await c.execute({
    sql: `SELECT title, company, alerted_at, COALESCE(posted_at, first_seen_at) AS t0, first_seen_at, posted_at
          FROM jobs WHERE alert_status = 'sent' AND alerted_at >= ? ORDER BY alerted_at DESC LIMIT 200`,
    args: [Date.now() - 7 * D],
  });
  const rows = r.rows.map((x) => ({
    title: String(x.title),
    company: String(x.company),
    latencyMin: Math.max(0, (Number(x.alerted_at) - Number(x.t0)) / 60_000),
    // detection latency = seen − posted (only meaningful when the source gives a time, not just a date)
    alertedAt: Number(x.alerted_at),
  }));
  const sorted = rows.map((r) => r.latencyMin).sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
  return { median, count: rows.length, recent: rows.slice(0, 4) };
}

export async function getAttention() {
  const c = await db();
  const now = Date.now();
  const [matches, failing] = await Promise.all([
    c.execute({
      sql: `SELECT id, title, company FROM jobs WHERE active = 1 AND dismissed = 0 AND starred = 0 AND score >= 80 AND ${FRESH_TS} >= ? ORDER BY score DESC LIMIT 3`,
      args: [now - D],
    }),
    c.execute(`SELECT name, last_error, last_ok FROM sources WHERE status = 'error' ORDER BY name LIMIT 4`),
  ]);
  const matchCount = Number(
    (await c.execute({ sql: `SELECT COUNT(*) AS n FROM jobs WHERE active = 1 AND dismissed = 0 AND starred = 0 AND score >= 80 AND ${FRESH_TS} >= ?`, args: [now - D] })).rows[0].n,
  );
  return {
    matchCount,
    topMatch: matches.rows[0] ? { id: String(matches.rows[0].id), title: String(matches.rows[0].title), company: String(matches.rows[0].company) } : null,
    failing: failing.rows.map((r) => ({ name: String(r.name), error: String(r.last_error ?? ""), lastOk: r.last_ok == null ? null : Number(r.last_ok) })),
  };
}

export async function getRecentAlerts(limit = 12) {
  const c = await db();
  const r = await c.execute({
    sql: `SELECT a.id, a.job_id, a.kind, a.text, a.sent_at, a.seen, a.channel FROM alerts a ORDER BY a.sent_at DESC LIMIT ?`,
    args: [limit],
  });
  const now = Date.now();
  return r.rows.map((x) => ({
    id: Number(x.id),
    jobId: x.job_id == null ? null : String(x.job_id),
    kind: String(x.kind),
    text: String(x.text),
    ago: ago(Number(x.sent_at), now),
    seen: Number(x.seen) === 1,
    channel: String(x.channel),
  }));
}

export async function getSourceHealth() {
  const c = await db();
  const r = await c.execute(
    `SELECT s.key, s.name, s.kind, s.grp, s.config, s.status, s.last_ok, s.last_error, s.job_count, s.added_by,
            (SELECT COUNT(*) FROM jobs j WHERE j.source = s.key AND j.active = 1) AS active
     FROM sources s
     ORDER BY CASE s.status WHEN 'error' THEN 0 WHEN 'unresolved' THEN 1 WHEN 'pending' THEN 2 WHEN 'ready' THEN 3 WHEN 'ok' THEN 4 ELSE 5 END, s.name`,
  );
  return r.rows.map((x) => ({
    key: String(x.key),
    name: String(x.name),
    group: x.grp == null ? null : String(x.grp),
    ats: x.config ? (JSON.parse(String(x.config)).ats as string) : String(x.kind),
    status: String(x.status),
    lastOk: x.last_ok == null ? null : Number(x.last_ok),
    error: x.last_error == null ? null : String(x.last_error),
    active: Number(x.active),
    addedBy: String(x.added_by),
  }));
}

// ── Research & Programs ─────────────────────────────────────────────────────

export interface ProgramView {
  p: Program;
  status: StatusInfo;
  windowLabel: string;
  deadline: number | null;
  lastChanged: number | null;
  lastChecked: number | null;
  error: string | null;
  recentlyChanged: boolean;
}

const STATUS_ORDER = { closing: 0, open: 1, soon: 2, rolling: 3, closed: 4 } as const;

export async function getPrograms(): Promise<ProgramView[]> {
  const c = await db();
  const rows = new Map((await c.execute(`SELECT id, deadline, last_changed, last_checked, last_error FROM programs`)).rows.map((r) => [String(r.id), r]));
  const now = Date.now();
  return PROGRAMS.map((p) => {
    const r = rows.get(p.id);
    const deadline = r?.deadline == null ? null : Number(r.deadline);
    const lastChanged = r?.last_changed == null ? null : Number(r.last_changed);
    return {
      p,
      status: programStatus(p, deadline, now),
      windowLabel: windowLabel(p.window),
      deadline,
      lastChanged,
      lastChecked: r?.last_checked == null ? null : Number(r.last_checked),
      error: r?.last_error == null ? null : String(r.last_error),
      recentlyChanged: lastChanged != null && now - lastChanged < 7 * D,
    };
  }).sort((a, b) => STATUS_ORDER[a.status.status] - STATUS_ORDER[b.status.status] || Number(b.p.india) - Number(a.p.india) || a.p.name.localeCompare(b.p.name));
}

// ── Pipeline ────────────────────────────────────────────────────────────────
export const PIPELINE_STAGES = ["saved", "applied", "interview", "offer", "rejected"] as const;
export type Stage = (typeof PIPELINE_STAGES)[number];

export interface PipelineCard {
  id: string;
  title: string;
  company: string;
  domain: string | null;
  logo: string | null;
  url: string;
  stage: Stage;
  postedTs: number;
  statusAt: number | null;
  appliedAt: number | null;
  /** applied_at − posted (or first seen), minutes */
  speedMin: number | null;
  active: boolean;
  deadline: number | null;
}

export async function getPipeline(): Promise<PipelineCard[]> {
  const c = await db();
  const domains = await domainMap();
  const r = await c.execute(
    `SELECT id, title, company, company_key, url, status, starred, status_at, applied_at, posted_at, first_seen_at, active, logo, deadline
     FROM jobs WHERE starred = 1 OR status IS NOT NULL ORDER BY COALESCE(status_at, first_seen_at) DESC`,
  );
  return r.rows.map((x) => {
    const stage = (PIPELINE_STAGES as readonly string[]).includes(String(x.status)) ? (String(x.status) as Stage) : "saved";
    const postedTs = Number(x.posted_at ?? x.first_seen_at);
    const appliedAt = x.applied_at == null ? null : Number(x.applied_at);
    return {
      id: String(x.id),
      title: String(x.title),
      company: String(x.company),
      domain: domains.get(String(x.company_key)) ?? domains.get(companyKey(String(x.company))) ?? null,
      logo: x.logo == null ? null : String(x.logo),
      url: String(x.url),
      stage,
      postedTs,
      statusAt: x.status_at == null ? null : Number(x.status_at),
      appliedAt,
      speedMin: appliedAt ? Math.max(0, (appliedAt - postedTs) / 60_000) : null,
      active: Number(x.active) === 1,
      deadline: x.deadline == null ? null : Number(x.deadline),
    };
  });
}

// ── Market insights ─────────────────────────────────────────────────────────
async function getMarketRaw(days: 30 | 90 = 30) {
  const c = await db();
  const now = Date.now();
  const W = 30 * D;
  const q = async (sql: string, args: (string | number)[] = []) => (await c.execute({ sql, args })).rows;
  const cur = `${FRESH_TS} >= ${now - W}`;
  const prev = `${FRESH_TS} >= ${now - 2 * W} AND ${FRESH_TS} < ${now - W}`;
  const profile = await getProfile();

  const [ai, week, indiaIntern, topCos, quiet, skillsCur, skillsPrev, levels, regions, openTime, early] = await Promise.all([
    q(`SELECT SUM(CASE WHEN ${cur} THEN 1 ELSE 0 END) c, SUM(CASE WHEN ${prev} THEN 1 ELSE 0 END) p FROM jobs WHERE is_tech = 1 AND domain = 'ai'`),
    q(`SELECT SUM(CASE WHEN ${FRESH_TS} >= ${now - 7 * D} THEN 1 ELSE 0 END) c, SUM(CASE WHEN ${FRESH_TS} >= ${now - 14 * D} AND ${FRESH_TS} < ${now - 7 * D} THEN 1 ELSE 0 END) p FROM jobs WHERE is_tech = 1`),
    q(`SELECT SUM(CASE WHEN ${cur} THEN 1 ELSE 0 END) c, SUM(CASE WHEN ${prev} THEN 1 ELSE 0 END) p FROM jobs WHERE is_tech = 1 AND region = 'india' AND level IN ('intern','research')`),
    q(`SELECT company, COUNT(*) n FROM jobs WHERE is_tech = 1 AND ${cur} GROUP BY company ORDER BY n DESC LIMIT 10`),
    q(`SELECT company, SUM(CASE WHEN ${prev} THEN 1 ELSE 0 END) p, SUM(CASE WHEN ${cur} THEN 1 ELSE 0 END) c
       FROM jobs WHERE is_tech = 1 AND ${FRESH_TS} >= ${now - 2 * W} AND ${AGGREGATE_SQL()} = 0
       GROUP BY company HAVING p >= 8 AND c * 4 <= p ORDER BY p DESC LIMIT 6`),
    q(`SELECT je.value AS skill, COUNT(*) n FROM jobs, json_each(jobs.skills) je WHERE is_tech = 1 AND ${cur} GROUP BY je.value ORDER BY n DESC LIMIT 60`),
    q(`SELECT je.value AS skill, COUNT(*) n FROM jobs, json_each(jobs.skills) je WHERE is_tech = 1 AND ${prev} GROUP BY je.value`),
    q(`SELECT level, COUNT(*) n FROM jobs WHERE is_tech = 1 AND ${cur} GROUP BY level`),
    q(`SELECT region, COUNT(*) n FROM jobs WHERE is_tech = 1 AND ${cur} GROUP BY region`),
    q(`SELECT AVG(inactive_at - COALESCE(posted_at, first_seen_at)) / ${D} AS days, COUNT(*) n FROM jobs WHERE active = 0 AND inactive_at IS NOT NULL AND is_tech = 1`),
    q(`SELECT je.value AS skill, COUNT(*) n FROM jobs, json_each(jobs.skills) je WHERE is_tech = 1 AND active = 1 AND level IN ('intern','newgrad','research') GROUP BY je.value ORDER BY n DESC LIMIT 40`),
  ]);
  // Job boards only list *open* roles, so last month's closed postings are invisible and any
  // month-over-month delta is inflated until RadarX has seen that month itself.
  const since = Number((await q(`SELECT MIN(started_at) AS t FROM runs`))[0]?.t ?? now);
  const historyDays = (now - since) / D;
  const monthOk = historyDays >= 60, weekOk = historyDays >= 14;
  const pct = (cnow: number, cprev: number, ok: boolean) => (ok && cprev > 0 ? Math.round(((cnow - cprev) / cprev) * 100) : null);
  const prevMap = new Map(skillsPrev.map((r) => [String(r.skill), Number(r.n)]));
  const demanded = skillsCur.slice(0, 15).map((r) => ({ skill: String(r.skill), n: Number(r.n) }));
  const rising = skillsCur
    .map((r) => ({ skill: String(r.skill), n: Number(r.n), prev: prevMap.get(String(r.skill)) ?? 0 }))
    .filter((r) => monthOk && r.n >= 15)
    .map((r) => ({ ...r, growth: (r.n - r.prev) / Math.max(r.prev, 10) }))
    .sort((a, b) => b.growth - a.growth)
    .slice(0, 8);
  const mine = new Set(profile.skills);
  const gap = early.filter((r) => !mine.has(String(r.skill))).slice(0, 12).map((r) => ({ skill: String(r.skill), n: Number(r.n) }));
  const n = (rows: any[], key: string) => Object.fromEntries(rows.map((r) => [String(r[key] ?? "other"), Number(r.n)]));
  const iiC = Number(indiaIntern[0].c ?? 0), iiP = Number(indiaIntern[0].p ?? 0);
  return {
    historyDays: Math.floor(historyDays),
    aiDelta: pct(Number(ai[0].c ?? 0), Number(ai[0].p ?? 0), monthOk),
    aiCount: Number(ai[0].c ?? 0),
    weekNew: Number(week[0].c ?? 0),
    weekDelta: pct(Number(week[0].c ?? 0), Number(week[0].p ?? 0), weekOk),
    indiaInternRatio: monthOk && iiP > 0 ? iiC / iiP : null,
    indiaInternCount: iiC,
    daily: await getVolume(days),
    topCompanies: topCos.map((r) => ({ company: String(r.company), n: Number(r.n) })),
    quiet: quiet.map((r) => ({ company: String(r.company), prev: Number(r.p), cur: Number(r.c) })),
    demanded,
    rising,
    levels: n(levels, "level"),
    regions: n(regions, "region"),
    avgOpenDays: openTime[0].n && Number(openTime[0].n) >= 20 ? Number(openTime[0].days) : null,
    closedSample: Number(openTime[0].n ?? 0),
    gap,
    hasResume: profile.skills.length > 0,
  };
}

// ── Live map ────────────────────────────────────────────────────────────────

export interface MapPoint {
  city: string;
  lat: number;
  lon: number;
  count: number;
  india: boolean;
  newest: { id: string; title: string; company: string; ago: string; minutes: number };
  top: { company: string; domain: string | null; logo: string | null };
}

/** Tech postings first seen / posted in the last `hours`, grouped by city. */
async function getMapPointsRaw(hours = 24): Promise<{ points: MapPoint[]; remote: number; total: number }> {
  const c = await db();
  const now = Date.now();
  const [domains, hidden] = await Promise.all([domainMap(), kvGet<string[]>("hidden_companies")]);
  const r = await c.execute({
    sql: `SELECT id, title, company, company_key, location, region, logo, ${FRESH_TS} AS fresh_ts FROM jobs
          WHERE active = 1 AND dismissed = 0 AND is_tech = 1 AND ${FRESH_TS} >= ? AND ${ONE_PER_ROLE}
          ORDER BY fresh_ts DESC LIMIT 4000`,
    args: [now - hours * H],
  });
  const byCity = new Map<string, MapPoint>();
  let remote = 0;
  for (const row of r.rows) {
    if (hidden?.includes(String(row.company_key))) continue;
    const loc = String(row.location ?? "");
    const cities = geocode(loc);
    if (!cities.length) {
      if (row.region === "remote") remote++;
      continue;
    }
    const ts = Number(row.fresh_ts);
    for (const g of cities) {
      const p = byCity.get(g.name);
      if (p) {
        p.count++;
        continue;
      }
      byCity.set(g.name, {
        city: g.name,
        lat: g.lat,
        lon: g.lon,
        count: 1,
        india: g.lat > 6 && g.lat < 37 && g.lon > 68 && g.lon < 98,
        newest: { id: String(row.id), title: String(row.title), company: String(row.company), ago: ago(ts, now), minutes: Math.round((now - ts) / 60_000) },
        top: {
          company: String(row.company),
          domain: domains.get(String(row.company_key)) ?? domains.get(companyKey(String(row.company))) ?? null,
          logo: row.logo == null ? null : String(row.logo),
        },
      });
    }
  }
  return { points: [...byCity.values()].sort((a, b) => b.count - a.count), remote, total: r.rows.length };
}

// ── ref-01 dashboard widgets ────────────────────────────────────────────────
const IST_MS = 330 * 60_000;

export interface ClosingItem {
  kind: "job" | "program";
  id: string;
  title: string;
  org: string;
  deadline: number;
  daysLeft: number;
  score: number | null;
  stipend: string | null;
  href: string;
}

/**
 * Applications closing in the next `days`: early-career tech postings with a known deadline
 * (Unstop gives one) plus programs whose official page shows a deadline. Programs first, then best match.
 */
async function getClosingSoonRaw(days = 7, limit = 5): Promise<{ items: ClosingItem[]; total: number; within48h: number }> {
  const c = await db();
  const now = Date.now();
  const [hidden, programs] = await Promise.all([kvGet<string[]>("hidden_companies"), getPrograms()]);
  const { sql, args } = where({ level: ["intern", "newgrad", "research"], tech: true }, now, hidden ?? []);
  const r = await c.execute({
    sql: `SELECT id, title, company, deadline, score, stipend FROM jobs
          WHERE ${sql} AND deadline > ? AND deadline <= ? AND status IS NULL
          ORDER BY score IS NULL, score DESC, deadline ASC LIMIT 200`,
    args: [...args, now, now + days * D],
  });
  const left = (t: number) => Math.max(0, Math.ceil((t - now) / D));
  const jobs: ClosingItem[] = r.rows.map((x) => ({
    kind: "job",
    id: String(x.id),
    title: String(x.title),
    org: String(x.company),
    deadline: Number(x.deadline),
    daysLeft: left(Number(x.deadline)),
    score: x.score == null ? null : Number(x.score),
    stipend: x.stipend == null ? null : String(x.stipend),
    href: `/?job=${encodeURIComponent(String(x.id))}`,
  }));
  const progs: ClosingItem[] = programs
    .filter((v) => v.deadline && v.deadline > now && v.deadline <= now + days * D)
    .map((v) => ({ kind: "program", id: v.p.id, title: v.p.name, org: v.p.org, deadline: v.deadline!, daysLeft: left(v.deadline!), score: null, stipend: v.p.stipend ?? null, href: "/research" }));
  // programs first (rarer, higher-stakes, soonest first), then the best-matching closing roles —
  // pure deadline order filled the list with weak matches
  const all = [...progs.sort((a, b) => a.deadline - b.deadline), ...jobs];
  return { items: all.slice(0, limit), total: all.length, within48h: all.filter((i) => i.deadline - now <= 2 * D).length };
}

/**
 * Detection lag: how long after a company posted a role RadarX first saw it. Only sources that
 * give a precise timestamp count (not Workday's "Posted Today"), and not rows from a silent first import.
 */
async function getDetectionRaw() {
  const c = await db();
  const now = Date.now();
  const precise = (await c.execute(`SELECT key FROM sources WHERE config LIKE '%"greenhouse"%' OR config LIKE '%"lever"%' OR config LIKE '%"ashby"%' OR config LIKE '%"smartrecruiters"%' OR config LIKE '%"unstop"%'`)).rows.map((r) => String(r.key));
  if (!precise.length) return { median: null, spread: null, rows: [], count: 0 };
  const r = await c.execute({
    sql: `SELECT j.title, j.company, j.posted_at, j.first_seen_at, s.name AS source FROM jobs j JOIN sources s ON s.key = j.source
          WHERE j.source IN (${precise.map(() => "?").join(",")}) AND COALESCE(j.alert_status, '') != 'seed' AND j.posted_at IS NOT NULL
            AND j.first_seen_at >= ? AND j.first_seen_at >= j.posted_at AND j.first_seen_at - j.posted_at < ?
          ORDER BY j.first_seen_at DESC LIMIT 300`,
    args: [...precise, now - 7 * D, 3 * D],
  });
  const lags = r.rows.map((x) => (Number(x.first_seen_at) - Number(x.posted_at)) / 60_000);
  const sorted = [...lags].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
  const p25 = sorted[Math.floor(sorted.length * 0.25)] ?? null, p75 = sorted[Math.floor(sorted.length * 0.75)] ?? null;
  const fmtT = (t: number) => new Date(t + IST_MS).toISOString().slice(11, 16);
  return {
    median,
    spread: p25 != null && p75 != null ? (p75 - p25) / 2 : null,
    count: sorted.length,
    rows: r.rows.slice(0, 4).map((x, i) => ({
      title: String(x.title),
      company: String(x.company),
      source: String(x.source),
      posted: fmtT(Number(x.posted_at)),
      seen: fmtT(Number(x.first_seen_at)),
      lagMin: lags[i],
    })),
  };
}

/** 6-hour buckets over 28 days + weekly totals, for the dense volume histogram. */
async function getVolumeBucketsRaw() {
  const c = await db();
  const now = Date.now();
  const B = 6 * H, N = 112;
  const r = await c.execute({
    sql: `SELECT CAST((? - ${FRESH_TS}) / ${B} AS INTEGER) AS b, COUNT(*) AS n FROM jobs WHERE is_tech = 1 AND ${FRESH_TS} >= ? GROUP BY b`,
    args: [now, now - N * B],
  });
  const bars = Array.from({ length: N }, (_, i) => Number(r.rows.find((x) => Number(x.b) === N - 1 - i)?.n ?? 0));
  const weeks = Array.from({ length: 4 }, (_, w) => bars.slice(w * 28, w * 28 + 28).reduce((s, n) => s + n, 0));
  return { bars, weeks, perDay: Math.round(bars.slice(-28).reduce((s, n) => s + n, 0) / 7) };
}

async function getSourceCountsRaw() {
  const c = await db();
  const r = await c.execute(`SELECT status, COUNT(*) AS n FROM sources GROUP BY status`);
  const m = Object.fromEntries(r.rows.map((x) => [String(x.status), Number(x.n)]));
  return { ok: m.ok ?? 0, error: m.error ?? 0, unresolved: m.unresolved ?? 0, total: Object.values(m).reduce((s, n) => s + n, 0) };
}

// ── Home hero KPIs: the three numbers that decide what to do today ──────────
async function getHomeKpisRaw() {
  const c = await db();
  const now = Date.now();
  const hidden = (await kvGet<string[]>("hidden_companies")) ?? [];
  const early = { level: ["intern", "newgrad", "research"] as JobFilters["level"], tech: true };
  const count = async (f: Partial<JobFilters>, extra = "") => {
    const { sql, args } = where(f, now, hidden);
    return Number((await c.execute({ sql: `SELECT COUNT(*) n FROM jobs WHERE ${sql}${extra}`, args })).rows[0].n ?? 0);
  };
  const hasResume = (await getProfile()).skills.length > 0;
  const [new24, india24, strong7, strong24, closing] = await Promise.all([
    count({ ...early, within: "24h" }),
    count({ ...early, within: "24h", region: ["india"] }),
    hasResume ? count({ ...early, within: "7d" }, " AND score >= 80 AND status IS NULL") : Promise.resolve(null),
    hasResume ? count({ ...early, within: "24h" }, " AND score >= 80") : Promise.resolve(null),
    getClosingSoon(7, 1),
  ]);
  return { new24, india24, strong7, strong24, closing: closing.total, closing48: closing.within48h, hasResume };
}

/** Top skills asked for in open early-career tech roles vs the resume: what to learn next. */
async function getSkillDemandRaw(limit = 6) {
  const c = await db();
  const profile = await getProfile();
  const early = `is_tech = 1 AND active = 1 AND dismissed = 0 AND level IN ('intern','newgrad','research')`;
  const [rows, tot] = await Promise.all([
    c.execute(`SELECT je.value AS skill, COUNT(*) n FROM jobs, json_each(jobs.skills) je WHERE ${early} GROUP BY je.value ORDER BY n DESC LIMIT 30`),
    c.execute(`SELECT COUNT(*) n FROM jobs WHERE ${early}`),
  ]);
  const total = Math.max(1, Number(tot.rows[0].n ?? 0));
  const mine = new Set(profile.skills.map((s) => s.toLowerCase()));
  const all = rows.rows.map((r) => ({ skill: String(r.skill), n: Number(r.n), share: Number(r.n) / total, have: mine.has(String(r.skill).toLowerCase()) }));
  const top = all.slice(0, limit);
  return {
    top,
    total,
    covered: top.filter((s) => s.have).length,
    learnNext: profile.skills.length ? all.find((s) => !s.have) ?? null : null,
    hasResume: profile.skills.length > 0,
  };
}

export const getHomeStats = cached("getHomeStats", getHomeStatsRaw);

export const getHomeKpis = cached("getHomeKpis", getHomeKpisRaw);

export const getMapPoints = cached("getMapPoints", getMapPointsRaw);

export const getVolumeBuckets = cached("getVolumeBuckets", getVolumeBucketsRaw);

export const getSourceCounts = cached("getSourceCounts", getSourceCountsRaw);

export const getMarket = cached("getMarket", getMarketRaw);

export const getClosingSoon = cached("getClosingSoon", getClosingSoonRaw);

export const getDetection = cached("getDetection", getDetectionRaw);

export const getVolume = cached("getVolume", getVolumeRaw);

export const getFreshness = cached("getFreshness", getFreshnessRaw);

export const getSkillDemand = cached("getSkillDemand", getSkillDemandRaw);
