/**
 * World-signals watcher (every WORLD_INTERVAL_MIN, default 15): USGS M4.5+ earthquakes (past day),
 * NASA EONET open natural events, and Frankfurter (ECB) FX for stipend conversion. All keyless public APIs.
 * Hosted-DB cost: only new/changed hazards are written; vanished ones are deactivated once.
 */
import { db, kvGet, kvSet } from "../lib/db";
import { fetchJson } from "../lib/http";
import { parseEonet, parseFxSeries, parseUsgs, type Hazard } from "../lib/world";

const INTERVAL_MS = (Number(process.env.WORLD_INTERVAL_MIN) || 15) * 60_000;
const DAY = 86_400_000;
/** every currency a country briefing may show (Frankfurter/ECB publishes these) */
const FX_SYMBOLS = "INR,EUR,GBP,CAD,CHF,SEK,NOK,DKK,PLN,CZK,RON,TRY,ILS,AED,ZAR,CNY,HKD,JPY,KRW,SGD,MYR,IDR,THB,PHP,AUD,NZD,MXN,BRL";

export interface WorldCheck {
  hazards: number;
  changed: number;
  fx: boolean;
  errors: string[];
}

export async function checkWorld(opts: { force?: boolean } = {}): Promise<WorldCheck | null> {
  const now = Date.now();
  if (!opts.force && now - ((await kvGet<number>("world_checked_at")) ?? 0) < INTERVAL_MS) return null;
  await kvSet("world_checked_at", now);
  const res: WorldCheck = { hazards: 0, changed: 0, fx: false, errors: [] };
  const c = await db();

  const live: Hazard[] = [];
  const feeds: [string, string, (o: unknown) => Hazard[]][] = [
    ["usgs", "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson", parseUsgs],
    ["eonet", "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=100&days=20", parseEonet],
  ];
  const ok = new Set<string>();
  for (const [name, url, parse] of feeds) {
    try {
      live.push(...parse((await fetchJson(url)).data));
      ok.add(name);
    } catch (e) {
      res.errors.push(`${name}: ${(e as Error).message}`);
    }
  }
  res.hazards = live.length;

  if (ok.size) {
    const known = new Map<string, string>();
    for (const r of (await c.execute(`SELECT id, ts, title, lat, lon, mag, active FROM hazards WHERE active = 1 OR ts > ${now - 3 * DAY}`)).rows) {
      known.set(String(r.id), `${r.ts}|${r.title}|${r.lat}|${r.lon}|${r.mag}|${r.active}`);
    }
    const stmts = [];
    const seen = new Set<string>();
    for (const h of live) {
      seen.add(h.id);
      if (known.get(h.id) === `${h.ts}|${h.title}|${h.lat}|${h.lon}|${h.mag}|1`) continue;
      stmts.push({
        sql: `INSERT INTO hazards (id, kind, title, mag, lat, lon, ts, url, active, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
              ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, title=excluded.title, mag=excluded.mag, lat=excluded.lat, lon=excluded.lon, ts=excluded.ts, url=excluded.url, active=1, updated_at=excluded.updated_at`,
        args: [h.id, h.kind, h.title, h.mag, h.lat, h.lon, h.ts, h.url, now],
      });
    }
    // anything from a feed that answered but is no longer listed → inactive (quakes age out of the 24h feed)
    for (const id of known.keys()) {
      const feed = id.startsWith("usgs:") ? "usgs" : "eonet";
      if (ok.has(feed) && !seen.has(id) && known.get(id)!.endsWith("|1")) stmts.push({ sql: `UPDATE hazards SET active = 0, updated_at = ? WHERE id = ?`, args: [now, id] });
    }
    // tidy: drop anything older than 30 days
    stmts.push({ sql: `DELETE FROM hazards WHERE ts < ? AND active = 0`, args: [now - 30 * DAY] });
    res.changed = stmts.length - 1;
    await c.batch(stmts, "write");
  }

  // FX once an hour is plenty (ECB publishes daily)
  if (now - ((await kvGet<number>("fx_at")) ?? 0) > 60 * 60_000) {
    try {
      const start = new Date(now - 30 * DAY).toISOString().slice(0, 10);
      const { data } = await fetchJson(`https://api.frankfurter.dev/v1/${start}..?base=USD&symbols=${FX_SYMBOLS}`);
      await kvSet("fx", parseFxSeries(data));
      await kvSet("fx_at", now);
      res.fx = true;
    } catch (e) {
      res.errors.push(`fx: ${(e as Error).message}`);
    }
  }
  return res;
}
