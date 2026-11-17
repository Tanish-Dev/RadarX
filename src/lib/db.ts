import { createClient, type Client, type InStatement, type ResultSet } from "@libsql/client";
import { mkdirSync } from "node:fs";

/**
 * libSQL client. Local file `data/radar.db` in dev, Turso in prod — chosen by
 * DATABASE_URL (+ DATABASE_AUTH_TOKEN for Turso). Migrations run on first use.
 */
const MIGRATIONS: string[][] = [
  // v1 — initial schema
  [
    `CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      company_key TEXT NOT NULL,
      company TEXT NOT NULL,
      title TEXT NOT NULL,
      location TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      posted_at INTEGER,
      first_seen_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      missed_runs INTEGER NOT NULL DEFAULT 0,
      inactive_at INTEGER,
      level TEXT,
      region TEXT,
      is_tech INTEGER,
      category TEXT,
      skills TEXT NOT NULL DEFAULT '[]',
      score INTEGER,
      notified INTEGER NOT NULL DEFAULT 0,
      alerted_at INTEGER,
      starred INTEGER NOT NULL DEFAULT 0,
      dismissed INTEGER NOT NULL DEFAULT 0,
      status TEXT,
      status_at INTEGER,
      applied_at INTEGER,
      dedupe_key TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS jobs_first_seen ON jobs(first_seen_at DESC)`,
    `CREATE INDEX IF NOT EXISTS jobs_posted ON jobs(posted_at DESC)`,
    `CREATE INDEX IF NOT EXISTS jobs_company ON jobs(company_key)`,
    `CREATE INDEX IF NOT EXISTS jobs_dedupe ON jobs(dedupe_key)`,
    `CREATE INDEX IF NOT EXISTS jobs_source ON jobs(source, active)`,
    `CREATE TABLE IF NOT EXISTS sources (
      key TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      grp TEXT,
      domain TEXT,
      config TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      last_ok INTEGER,
      last_run INTEGER,
      last_error TEXT,
      job_count INTEGER NOT NULL DEFAULT 0,
      seeded INTEGER NOT NULL DEFAULT 0,
      last_discovery INTEGER,
      added_by TEXT NOT NULL DEFAULT 'registry'
    )`,
    `CREATE TABLE IF NOT EXISTS programs (
      id TEXT PRIMARY KEY,
      hash TEXT,
      snippet TEXT,
      status TEXT,
      last_checked INTEGER,
      last_changed INTEGER,
      last_error TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at INTEGER NOT NULL,
      finished_at INTEGER,
      new_jobs INTEGER NOT NULL DEFAULT 0,
      alerted INTEGER NOT NULL DEFAULT 0,
      errors INTEGER NOT NULL DEFAULT 0,
      sources_ok INTEGER NOT NULL DEFAULT 0,
      summary TEXT
    )`,
  ],
  // v2 — classification extras, alert bookkeeping
  [
    `ALTER TABLE jobs ADD COLUMN domain TEXT`,
    `ALTER TABLE jobs ADD COLUMN title_skills TEXT NOT NULL DEFAULT '[]'`,
    `ALTER TABLE jobs ADD COLUMN classifier_version INTEGER NOT NULL DEFAULT 0`,
    /** sent | filtered | dup | overflow | expired | seed | stale — null while pending */
    `ALTER TABLE jobs ADD COLUMN alert_status TEXT`,
    `ALTER TABLE jobs ADD COLUMN enriched INTEGER NOT NULL DEFAULT 0`,
    `CREATE INDEX IF NOT EXISTS jobs_pending ON jobs(notified, active)`,
    `CREATE INDEX IF NOT EXISTS jobs_score ON jobs(score DESC)`,
    `CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT,
      channel TEXT NOT NULL,
      kind TEXT NOT NULL,
      text TEXT NOT NULL,
      sent_at INTEGER NOT NULL,
      seen INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS alerts_sent ON alerts(sent_at DESC)`,
    `UPDATE jobs SET alert_status = 'seed' WHERE notified = 1`,
  ],
  // v3 — Simplify "terms" were stored as the description
  [`UPDATE jobs SET description = '' WHERE source LIKE 'simplify-%'`],
  // v4 — cross-source linking: the ATS job id, and the id found in an aggregate's apply URL
  [
    `ALTER TABLE jobs ADD COLUMN ext_id TEXT`,
    `ALTER TABLE jobs ADD COLUMN url_id TEXT`,
    `UPDATE jobs SET ext_id = substr(id, instr(id, ':') + 1)`,
    `CREATE INDEX IF NOT EXISTS jobs_ext ON jobs(ext_id)`,
  ],
  // v5 — India sources (stipend, deadline, logo) and the program page watcher
  [
    `ALTER TABLE jobs ADD COLUMN stipend TEXT`,
    `ALTER TABLE jobs ADD COLUMN deadline INTEGER`,
    `ALTER TABLE jobs ADD COLUMN logo TEXT`,
    `ALTER TABLE programs ADD COLUMN deadline INTEGER`,
    `ALTER TABLE programs ADD COLUMN pending_alert INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE programs ADD COLUMN changed_lines TEXT`,
    `CREATE INDEX IF NOT EXISTS jobs_deadline ON jobs(deadline)`,
  ],
  // v6 — tech & world news (RSS/Atom), placed on the map
  [
    `CREATE TABLE IF NOT EXISTS news (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      summary TEXT,
      image TEXT,
      published_at INTEGER,
      first_seen_at INTEGER NOT NULL,
      place TEXT,
      lat REAL,
      lon REAL,
      india INTEGER NOT NULL DEFAULT 0,
      topics TEXT,
      points INTEGER,
      cluster TEXT,
      coverage INTEGER NOT NULL DEFAULT 1
    )`,
    `CREATE INDEX IF NOT EXISTS news_ts ON news(published_at)`,
    `CREATE INDEX IF NOT EXISTS news_cluster ON news(cluster)`,
  ],
  // v7 — stock watchlist (Twelve Data)
  [
    `CREATE TABLE IF NOT EXISTS stocks (
      key TEXT PRIMARY KEY,
      name TEXT,
      exchange TEXT,
      currency TEXT,
      price REAL,
      change REAL,
      pct REAL,
      prev_close REAL,
      day_low REAL,
      day_high REAL,
      low52 REAL,
      high52 REAL,
      is_open INTEGER NOT NULL DEFAULT 0,
      quote_at INTEGER,
      updated_at INTEGER,
      error TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS stock_history (key TEXT NOT NULL, day TEXT NOT NULL, close REAL NOT NULL, PRIMARY KEY (key, day))`,
  ],
  // v8 — hosted-DB cost: indexes so per-run queries read only what changed
  [
    `CREATE INDEX IF NOT EXISTS jobs_url_id ON jobs(url_id)`,
    `CREATE INDEX IF NOT EXISTS jobs_classifier ON jobs(classifier_version)`,
  ],
];

let client: Client | null = null;
let ready: Promise<void> | null = null;

/** Rows written / returned since start (RADAR_DB_STATS=1) — hosted DBs bill by rows, so the worker reports these. */
export const dbStats = { writes: 0, rowsReturned: 0, statements: 0 };

function makeClient(): Client {
  const url = process.env.DATABASE_URL || "file:data/radar.db";
  if (url.startsWith("file:")) mkdirSync("data", { recursive: true });
  const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN || undefined });
  if (!process.env.RADAR_DB_STATS) return client;
  const tally = (r: { rowsAffected: number; rows: unknown[] }) => {
    dbStats.statements++;
    dbStats.writes += r.rowsAffected;
    dbStats.rowsReturned += r.rows.length;
  };
  const exec = client.execute.bind(client) as (s: InStatement) => Promise<ResultSet>;
  const batch = client.batch.bind(client);
  (client as any).execute = async (s: InStatement) => {
    const r = await exec(s);
    tally(r);
    return r;
  };
  (client as any).batch = async (stmts: InStatement[], mode?: any) => {
    const rs = await batch(stmts, mode);
    rs.forEach(tally);
    return rs;
  };
  return client;
}

async function migrate(c: Client) {
  if ((process.env.DATABASE_URL || "file:").startsWith("file:")) {
    // the dashboard and the worker share the file: WAL lets reads and a write run concurrently,
    // and busy_timeout makes a blocked writer wait instead of failing with SQLITE_BUSY
    await c.execute(`PRAGMA busy_timeout = 15000`);
    await c.execute(`PRAGMA journal_mode = WAL`);
  }
  await c.execute(`CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  const r = await c.execute(`SELECT value FROM kv WHERE key = 'schema_version'`);
  let v = r.rows.length ? Number(r.rows[0].value) : 0;
  while (v < MIGRATIONS.length) {
    const stmts: InStatement[] = [
      ...MIGRATIONS[v],
      { sql: `INSERT OR REPLACE INTO kv (key, value) VALUES ('schema_version', ?)`, args: [String(v + 1)] },
    ];
    await c.batch(stmts, "write");
    v++;
  }
}

export async function db(): Promise<Client> {
  if (!client) client = makeClient();
  if (!ready) ready = migrate(client);
  await ready;
  return client;
}

// ── kv helpers ───────────────────────────────────────────────────────────────
export async function kvGet<T = string>(key: string): Promise<T | null> {
  const c = await db();
  const r = await c.execute({ sql: `SELECT value FROM kv WHERE key = ?`, args: [key] });
  if (!r.rows.length) return null;
  const raw = String(r.rows[0].value);
  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as T;
  }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  const c = await db();
  await c.execute({
    sql: `INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: [key, JSON.stringify(value)],
  });
}
