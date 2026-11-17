import { createHash } from "node:crypto";
/** Keeps the `sources` table in sync with src/data/companies.ts and runs ATS discovery. */
import pLimit from "p-limit";
import { AGGREGATES, COMPANIES, type Company } from "../data/companies";
import { db, kvGet, kvSet } from "../lib/db";
import { slugify } from "../lib/text";
import { discoverAts } from "../sources/discover";
import type { SourceConfig } from "../sources/types";

export interface SourceRow {
  key: string;
  name: string;
  kind: string;
  grp: string | null;
  domain: string | null;
  config: SourceConfig | null;
  status: string;
  seeded: boolean;
  last_discovery: number | null;
  last_ok?: number | null;
  job_count?: number | null;
}

const WEEK = 7 * 86_400_000;

export function sourceKeyFor(c: Pick<Company, "name">) {
  return slugify(c.name);
}

/** Insert registry companies that aren't in the DB yet; refresh explicit configs. */
export async function syncRegistry(): Promise<void> {
  // the registry only changes when the code does — don't rewrite ~330 rows on every poll
  const sig = createHash("sha1").update(JSON.stringify([COMPANIES, AGGREGATES])).digest("hex");
  if ((await kvGet<string>("registry_sig")) === sig) return;
  const c = await db();
  const stmts = COMPANIES.map((co) => {
    const src = co.source;
    const explicit = src.ats !== "auto" && src.ats !== "none";
    const status = src.ats === "none" ? "unsupported" : explicit ? "ready" : "pending";
    return {
      sql: `INSERT INTO sources (key, name, kind, grp, domain, config, status, last_error)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
              name = excluded.name, grp = excluded.grp, domain = excluded.domain,
              kind = excluded.kind,
              config = CASE WHEN excluded.kind != 'auto' THEN excluded.config
                            WHEN sources.kind = 'auto' THEN sources.config ELSE NULL END,
              last_discovery = CASE WHEN excluded.kind = 'auto' AND sources.kind != 'auto' THEN NULL ELSE sources.last_discovery END,
              status = CASE WHEN excluded.kind = 'none' THEN 'unsupported'
                            WHEN excluded.kind = 'auto' AND sources.kind != 'auto' THEN 'pending'
                            WHEN excluded.kind != 'auto' AND sources.status IN ('pending','unresolved','unsupported') THEN 'ready'
                            ELSE sources.status END
            WHERE sources.added_by = 'registry'`,
      args: [
        sourceKeyFor(co),
        co.name,
        src.ats === "auto" ? "auto" : src.ats === "none" ? "none" : "explicit",
        co.group,
        co.domain,
        explicit ? JSON.stringify(src) : null,
        status,
        src.ats === "none" ? src.note : null,
      ],
    };
  });
  for (const ag of AGGREGATES) {
    stmts.push({
      sql: `INSERT INTO sources (key, name, kind, grp, domain, config, status) VALUES (?, ?, 'aggregate', NULL, ?, ?, 'ready')
            ON CONFLICT(key) DO UPDATE SET config = excluded.config, name = excluded.name`,
      args: [ag.key, ag.name, ag.domain, JSON.stringify(ag.config)] as any,
    });
  }
  await c.batch(stmts, "write");
  await kvSet("registry_sig", sig);
}

export async function loadSources(): Promise<SourceRow[]> {
  const c = await db();
  const r = await c.execute(`SELECT key, name, kind, grp, domain, config, status, seeded, last_discovery, last_ok, job_count FROM sources ORDER BY name`);
  return r.rows.map((row) => ({
    key: String(row.key),
    name: String(row.name),
    kind: String(row.kind),
    grp: row.grp == null ? null : String(row.grp),
    domain: row.domain == null ? null : String(row.domain),
    config: row.config ? (JSON.parse(String(row.config)) as SourceConfig) : null,
    status: String(row.status),
    seeded: Number(row.seeded) === 1,
    last_discovery: row.last_discovery == null ? null : Number(row.last_discovery),
    last_ok: row.last_ok == null ? null : Number(row.last_ok),
    job_count: row.job_count == null ? null : Number(row.job_count),
  }));
}

export interface DiscoveryReport {
  resolved: { name: string; config: SourceConfig; count: number; candidates: string[] }[];
  unresolved: string[];
}

/**
 * Discover the ATS for `auto` companies with no config: never tried, or
 * unresolved and last tried > 1 week ago (or `force`).
 */
export async function runDiscovery(opts: { force?: boolean; all?: boolean; now?: number } = {}): Promise<DiscoveryReport> {
  const now = opts.now ?? Date.now();
  const c = await db();
  const sources = (await loadSources()).filter(
    (s) =>
      s.kind === "auto" &&
      (opts.all || (!s.config && (opts.force || s.last_discovery == null || now - s.last_discovery > WEEK))),
  );
  const slugsByKey = new Map(
    COMPANIES.filter((co) => co.source.ats === "auto").map((co) => [sourceKeyFor(co), (co.source as { slugs: string[] }).slugs]),
  );
  const report: DiscoveryReport = { resolved: [], unresolved: [] };
  const limit = pLimit(8);
  await Promise.all(
    sources.map((s) =>
      limit(async () => {
        const { config, count, candidates } = await discoverAts(s.name, slugsByKey.get(s.key) ?? []);
        if (config) report.resolved.push({ name: s.name, config, count, candidates });
        else report.unresolved.push(s.name);
        if (!config && s.config) {
          // re-discovery failed (often a timeout) but we already have a working board — keep it
          await c.execute({ sql: `UPDATE sources SET last_discovery = ? WHERE key = ?`, args: [now, s.key] });
          return;
        }
        await c.execute({
          sql: `UPDATE sources SET config = ?, status = ?, last_discovery = ?, last_error = ? WHERE key = ?`,
          args: [
            config ? JSON.stringify(config) : null,
            config ? "ready" : "unresolved",
            now,
            config ? null : "No Greenhouse/Lever/Ashby/SmartRecruiters board found — add a careers URL",
            s.key,
          ],
        });
      }),
    ),
  );
  return report;
}
