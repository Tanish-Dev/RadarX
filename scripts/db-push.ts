/**
 * One-time copy of the local SQLite DB (data/radar.db) into the hosted DB (Turso).
 *   DATABASE_URL=libsql://radarx-<you>.turso.io DATABASE_AUTH_TOKEN=... npm run db:push
 * Copies your resume profile, alert rules, pipeline stages, jobs, news, programs and stocks, so the
 * hosted worker continues where your laptop left off (no re-seeding, no duplicate alerts).
 * Cost: one write per row (~50k) — a one-off ~0.5% of Turso's monthly free writes.
 */
import "../src/worker/env";
import { createClient, type InStatement } from "@libsql/client";
import { db } from "../src/lib/db";

const TABLES = ["kv", "sources", "programs", "jobs", "alerts", "news", "stocks", "stock_history"];

async function main() {
  const target = process.env.DATABASE_URL ?? "";
  if (!target || target.startsWith("file:")) {
    console.error("Set DATABASE_URL (libsql://…) and DATABASE_AUTH_TOKEN to your Turso database first.");
    process.exit(1);
  }
  const src = createClient({ url: "file:data/radar.db" });
  const dst = await db(); // runs migrations on the target
  for (const t of TABLES) {
    const cols = (await src.execute(`PRAGMA table_info(${t})`)).rows.map((r) => String(r.name));
    const dstCols = new Set((await dst.execute(`PRAGMA table_info(${t})`)).rows.map((r) => String(r.name)));
    const use = cols.filter((c) => dstCols.has(c) && !(t === "kv" && c === "schema_version"));
    let copied = 0;
    for (let offset = 0; ; offset += 500) {
      const rows = (await src.execute({ sql: `SELECT ${use.join(",")} FROM ${t} LIMIT 500 OFFSET ?`, args: [offset] })).rows;
      if (!rows.length) break;
      const stmts: InStatement[] = rows
        .filter((r) => !(t === "kv" && r.key === "schema_version"))
        .map((r) => ({ sql: `INSERT OR REPLACE INTO ${t} (${use.join(",")}) VALUES (${use.map(() => "?").join(",")})`, args: use.map((c) => r[c] as any) }));
      await dst.batch(stmts, "write");
      copied += rows.length;
      process.stdout.write(`\r${t}: ${copied}`);
    }
    console.log(`\r${t}: ${copied} rows`);
  }
  console.log("Done — point the dashboard (Vercel) and the worker (GitHub secrets) at this DATABASE_URL.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
