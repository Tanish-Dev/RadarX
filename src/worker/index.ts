/**
 * RadarX worker.
 *   npm run worker -- --once                 poll every source once
 *   npm run worker -- --loop                 poll every POLL_INTERVAL_MIN minutes (default 5)
 *   npm run worker -- --discover [--all]     (re)discover ATS for unresolved (or all auto) companies
 *   npm run worker -- --health               print source health from the DB
 *   npm run worker -- --programs             check every research/program page now
 *   npm run worker -- --news                 poll every tech/world news feed now
 *   npm run worker -- --stocks [--demo]      refresh the stock watchlist now (needs TWELVEDATA_API_KEY; --demo = AAPL only)
 *   npm run worker -- --enrich [N]           fetch missing descriptions for early-career postings (default 500)
 *   add  --only greenhouse,stripe            to restrict a run to matching sources / ATS types
 */
import "./env";
import { db, dbStats } from "../lib/db";
import { loadSources, runDiscovery, syncRegistry } from "./registry";
import { runOnce, type RunSummary } from "./run";

const args = process.argv.slice(2);
const has = (f: string) => args.includes(f);
const val = (f: string) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : undefined;
};

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};
const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n));

function printSummary(s: RunSummary) {
  const rows = [...s.results].sort((a, b) => Number(a.ok) - Number(b.ok) || b.newJobs - a.newJobs || a.name.localeCompare(b.name));
  console.log("\n" + c.bold(pad("SOURCE", 30) + pad("ATS", 16) + "STATUS".padEnd(10) + "JOBS".padStart(7) + "NEW".padStart(7) + "TIME".padStart(8)));
  for (const r of rows) {
    const status = r.ok ? (r.unchanged ? c.dim("304    ") : r.seededNow ? c.yellow("seeded ") : c.green("ok     ")) : c.red("FAIL   ");
    console.log(
      pad(r.name, 30) + pad(r.ats, 16) + status.padEnd(19) +
        String(r.unchanged ? "–" : r.fetched).padStart(7) + String(r.newJobs || "").padStart(7) +
        `${(r.ms / 1000).toFixed(1)}s`.padStart(8) + (r.error ? "  " + c.red(r.error) : ""),
    );
  }
  const ok = s.results.filter((r) => r.ok).length;
  const fetched = s.results.reduce((n, r) => n + r.fetched, 0);
  console.log(
    `\n${c.bold("Run finished")} in ${((s.finishedAt - s.startedAt) / 1000).toFixed(1)}s — ` +
      `${c.green(`${ok} ok`)}, ${s.results.length - ok ? c.red(`${s.results.length - ok} failed`) : "0 failed"}, ` +
      `${fetched} postings fetched, ${c.bold(String(s.newJobs))} new (alertable)` +
      (s.discovered || s.unresolved ? `, discovery: ${s.discovered} resolved / ${s.unresolved} unresolved` : ""),
  );
  const a = s.alerts;
  const held = a.held ? c.yellow(` ${a.held} held (${a.heldReason === "no-channel" ? "no Telegram/Discord configured" : "quiet hours"})`) : "";
  console.log(
    `${c.bold("Alerts")}: ${c.green(`${a.sent} sent`)}${a.overflow ? `, ${a.overflow} in summary` : ""}, ${a.filtered} filtered by rules, ${a.dup} duplicates` +
      (a.expired ? `, ${a.expired} expired` : "") + held + (a.channels.length ? c.dim(`  via ${a.channels.join(" + ")}`) : "") +
      (s.classified ? c.dim(`  · classified ${s.classified}`) : ""),
  );
  for (const e of [...new Set(a.errors)]) console.log(c.red("  alert error: ") + e);
  if (s.programs) printPrograms(s.programs, s.programAlerts);
  if (s.news) printNews(s.news);
  if (process.env.RADAR_DB_STATS)
    console.log(c.dim(`DB: ${dbStats.writes.toLocaleString()} rows written · ${dbStats.rowsReturned.toLocaleString()} rows returned · ${dbStats.statements.toLocaleString()} statements`));
}

function printNews(rows: { id: string; ok: boolean; fetched: number; added: number; unchanged?: boolean; error?: string }[]) {
  const ok = rows.filter((r) => r.ok).length;
  console.log(`${c.bold("News")}: ${ok}/${rows.length} feeds ok, ${c.green(`${rows.reduce((n, r) => n + r.added, 0)} new stories`)}` + c.dim(`  (${rows.filter((r) => r.unchanged).length} unchanged)`));
  for (const r of rows.filter((r) => !r.ok)) console.log(c.red(`  ${r.id}: ${r.error}`));
}

function printPrograms(rows: { id: string; ok: boolean; changed: boolean; seeded: boolean; lines: number; error?: string }[], alerted = 0) {
  const ok = rows.filter((r) => r.ok).length;
  const changed = rows.filter((r) => r.changed).map((r) => r.id);
  console.log(
    `${c.bold("Programs")}: ${ok}/${rows.length} pages checked` +
      (changed.length ? c.yellow(`, changed: ${changed.join(", ")}`) : ", no changes") +
      (alerted ? c.green(`, ${alerted} alerted`) : ""),
  );
  for (const r of rows.filter((r) => !r.ok)) console.log(c.red(`  ${r.id}: ${r.error}`));
}

async function health() {
  await syncRegistry();
  const client = await db();
  const r = await client.execute(
    `SELECT s.name, s.kind, s.status, s.config, s.last_ok, s.last_error, s.job_count,
            (SELECT COUNT(*) FROM jobs j WHERE j.source = s.key AND j.active = 1) AS active
     FROM sources s ORDER BY CASE s.status WHEN 'error' THEN 0 WHEN 'unresolved' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END, s.name`,
  );
  const ago = (t: unknown) => (t == null ? "never" : `${Math.round((Date.now() - Number(t)) / 60000)}m ago`);
  console.log(c.bold(pad("SOURCE", 30) + pad("ATS", 16) + pad("STATUS", 13) + pad("LAST OK", 12) + "ACTIVE".padStart(7)) + "  NOTE");
  const counts: Record<string, number> = {};
  for (const row of r.rows) {
    const status = String(row.status);
    counts[status] = (counts[status] ?? 0) + 1;
    const ats = row.config ? JSON.parse(String(row.config)).ats : String(row.kind);
    const col = status === "ok" ? c.green : status === "error" ? c.red : status === "unresolved" ? c.yellow : c.dim;
    console.log(
      pad(String(row.name), 30) + pad(ats, 16) + col(pad(status, 13)) + pad(ago(row.last_ok), 12) +
        String(row.active).padStart(7) + "  " + c.dim(String(row.last_error ?? "")),
    );
  }
  const jobs = await client.execute(`SELECT COUNT(*) n, SUM(active) a FROM jobs`);
  console.log(`\n${Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(" · ")} — ${jobs.rows[0].a ?? 0} active / ${jobs.rows[0].n} total postings`);
}

async function main() {
  const only = val("--only")?.split(",").filter(Boolean);
  if (has("--health")) return health();
  if (has("--discover")) {
    await syncRegistry();
    console.log("Discovering ATS for unresolved companies…");
    const rep = await runDiscovery({ force: true, all: has("--all") });
    for (const r of rep.resolved.sort((a, b) => a.name.localeCompare(b.name)))
      console.log(c.green("✓ ") + pad(r.name, 30) + pad(`${r.config.ats}:${(r.config as any).slug}`, 36) + c.dim(r.candidates.join("  ")));
    for (const n of rep.unresolved) console.log(c.yellow("✗ ") + n);
    console.log(`\n${rep.resolved.length} resolved, ${rep.unresolved.length} unresolved`);
    return;
  }
  if (has("--programs")) {
    const { checkPrograms, sendProgramAlerts } = await import("./programs");
    const rows = (await checkPrograms({ force: true }))!;
    for (const r of rows) console.log((r.ok ? c.green("✓ ") : c.red("✗ ")) + pad(r.id, 22) + (r.ok ? `${r.lines} watched lines${r.seeded ? c.dim(" (first fetch, stored silently)") : r.changed ? c.yellow(" CHANGED") : ""}` : c.red(r.error ?? "")));
    printPrograms(rows, await sendProgramAlerts());
    return;
  }
  if (has("--stocks")) {
    const { checkStocks } = await import("./stocks");
    const r = await checkStocks({ force: true, demo: has("--demo") });
    if (!r) return console.log(c.yellow("No TWELVEDATA_API_KEY set — get a free key at https://twelvedata.com/pricing and add it to .env.local (or use --demo for AAPL only)."));
    console.log(`${c.bold("Stocks")}: ${c.green(`${r.ok} quotes`)}${r.series ? `, history for ${r.series}` : ""}`);
    for (const f of r.failed) console.log(c.red(`  ${f.key}: ${f.error}`));
    return;
  }
  if (has("--news")) {
    const { checkNews } = await import("./news");
    const rows = (await checkNews({ force: true }))!;
    for (const r of rows) console.log((r.ok ? c.green("✓ ") : c.red("✗ ")) + pad(r.id, 16) + (r.ok ? (r.unchanged ? c.dim("304 unchanged") : `${r.fetched} items, ${r.added} new`) : c.red(r.error ?? "")));
    printNews(rows);
    return;
  }
  if (has("--enrich")) {
    const n = Number(val("--enrich")) || 500;
    const { enrichBacklog, linkAggregateDuplicates } = await import("./run");
    const { classifyPending } = await import("../lib/jobs");
    console.log(`Linked ${await linkAggregateDuplicates({ full: true })} Simplify rows to their direct-ATS postings`);
    console.log(`Fetching descriptions for up to ${n} early-career postings…`);
    console.log(`Enriched ${await enrichBacklog(n)} · reclassified ${await classifyPending()}`);
    return;
  }
  if (has("--loop")) {
    const mins = Number(process.env.POLL_INTERVAL_MIN) || 5;
    console.log(`Polling every ${mins} min. Ctrl+C to stop.`);
    for (;;) {
      const t0 = Date.now();
      try {
        printSummary(await runOnce({ only }));
      } catch (e) {
        console.error(c.red("Run crashed:"), e);
      }
      const wait = Math.max(10_000, mins * 60_000 - (Date.now() - t0));
      console.log(c.dim(`next run in ${Math.round(wait / 1000)}s`));
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  // default: --once
  printSummary(await runOnce({ only }));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
