/** Server reads for World Monitor+ signals: internet outages, service status, prediction markets, news surges. */
import "server-only";
import { COUNTRIES, countryByIso } from "../data/countries";
import { MARKET_LANES, type MarketLane } from "../data/infra";
import { db, kvGet } from "./db";
import { findSurges, surgeTerms, type Headline, type Market, type Outage, type ServiceStatus, type Surge } from "./signals";
import { ago, agoShort } from "./time";

const H = 3_600_000;

export interface OutageView extends Outage {
  flag: string;
  /** map position (bbox centre) — only for countries in the gazetteer */
  lat: number | null;
  lon: number | null;
  since: string;
  endedAgo: string;
  hours: number;
}

export async function getOutages(): Promise<{ outages: OutageView[]; at: string | null }> {
  const [raw, at] = await Promise.all([kvGet<Outage[]>("outages"), kvGet<number>("signals_checked_at")]);
  const now = Date.now();
  const outages = (raw ?? []).map((o) => {
    const c = countryByIso(o.iso);
    const [a, b, cc, d] = c?.bbox ?? [NaN, NaN, NaN, NaN];
    return {
      ...o,
      flag: c?.flag ?? String.fromCodePoint(...[...o.iso].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65)),
      lat: c ? Math.round(((a + cc) / 2) * 100) / 100 : null,
      lon: c ? Math.round(((b + d) / 2) * 100) / 100 : null,
      since: ago(o.start, now),
      endedAgo: ago(o.end, now),
      hours: Math.max(1, Math.round((Math.min(o.end, now) - o.start) / H)),
    };
  });
  return { outages, at: at ? ago(at, now) : null };
}

/** Outages worth a map marker: ongoing, and not the long-tail "minor" blips. */
export const mapOutages = (o: OutageView[]) => o.filter((x) => x.ongoing && x.level !== "minor" && x.lat != null);

export interface StatusView extends ServiceStatus {
  lastAgo: string | null;
}

export async function getServiceStatus(): Promise<{ services: StatusView[]; at: string | null }> {
  const [raw, at] = await Promise.all([kvGet<ServiceStatus[]>("service_status"), kvGet<number>("signals_checked_at")]);
  const now = Date.now();
  const services = (raw ?? []).map((s) => ({ ...s, lastAgo: s.last ? agoShort(s.last.ts, now) : null }));
  return { services, at: at ? ago(at, now) : null };
}

/** Prediction markets per lane — near-duplicates (8 brackets of the same IPO) collapse to the busiest one. */
export async function getMarkets(perLane = 5): Promise<{ lanes: { tag: MarketLane; label: string; markets: Market[] }[]; at: string | null }> {
  const [raw, at] = await Promise.all([kvGet<Market[]>("markets"), kvGet<number>("markets_at")]);
  const all = raw ?? [];
  const lanes = MARKET_LANES.map(({ tag, label }) => {
    const kept: { m: Market; t: Set<string> }[] = [];
    for (const m of all.filter((x) => x.lane === tag).sort((a, b) => b.volume24h - a.volume24h)) {
      const t = surgeTerms(m.title);
      const similar = kept.some((k) => {
        let n = 0;
        for (const w of t) if (k.t.has(w)) n++;
        return n >= 2 && n / Math.min(t.size, k.t.size) >= 0.5;
      });
      if (!similar) kept.push({ m, t });
      if (kept.length >= perLane) break;
    }
    return { tag, label, markets: kept.map((k) => k.m) };
  });
  return { lanes, at: at ? ago(at) : null };
}

/** Markets that name a country (briefings). */
export async function getCountryMarkets(iso: string): Promise<Market[]> {
  const row = COUNTRIES.find((r) => r[0] === iso);
  if (!row) return [];
  const names = [row[1], ...(row.slice(4) as string[])].filter((n) => n.length >= 4 || n === "uae");
  // letter lookarounds, not \b — "U.S." ends in a dot, where \b never matches
  const re = new RegExp(`(?<![a-z])(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![a-z])`, "i");
  return ((await kvGet<Market[]>("markets")) ?? []).filter((m) => re.test(m.title)).sort((a, b) => b.volume24h - a.volume24h).slice(0, 4);
}

let surgeCache: { at: number; surges: Surge[] } | null = null;

/** Terms many outlets started using in the last 6 h, vs their 7-day rhythm. */
export async function getSurges(): Promise<Surge[]> {
  const now = Date.now();
  if (surgeCache && now - surgeCache.at < 5 * 60_000) return surgeCache.surges;
  const c = await db();
  const r = await c.execute({
    sql: `SELECT source, kind, title, url, COALESCE(published_at, first_seen_at) ts FROM news WHERE COALESCE(published_at, first_seen_at) >= ? ORDER BY ts DESC LIMIT 6000`,
    args: [now - (7 * 24 + 6) * H],
  });
  const items: Headline[] = r.rows.map((x) => ({ source: String(x.source), kind: String(x.kind), title: String(x.title), url: String(x.url), ts: Number(x.ts) }));
  const surges = findSurges(items, now).slice(0, 12);
  surgeCache = { at: now, surges };
  return surges;
}
