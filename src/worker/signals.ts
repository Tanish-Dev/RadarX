/**
 * World Monitor+ watcher (inside each run): internet outages (IODA) + service status every SIGNALS_INTERVAL_MIN (10),
 * Polymarket prediction markets every MARKETS_INTERVAL_MIN (30), submarine cables weekly. All keyless public APIs.
 * Hosted-DB cost: everything lives in kv and is written only when the content changed.
 */
import pLimit from "p-limit";
import { CABLES_URL, MARKET_LANES, STATUS_PAGES, type StatusPage } from "../data/infra";
import { kvGet, kvSet } from "../lib/db";
import { fetchJson, fetchText } from "../lib/http";
import { parseAwsRss, parseGcpIncidents, parseIodaEvents, parsePolymarket, parseStatusAtom, simplifyCables, summarise, type Incident, type Market, type ServiceStatus } from "../lib/signals";

const MIN = 60_000;
const INTERVAL = (Number(process.env.SIGNALS_INTERVAL_MIN) || 10) * MIN;
const MARKETS_INTERVAL = (Number(process.env.MARKETS_INTERVAL_MIN) || 30) * MIN;

export interface SignalsCheck {
  outages: number | null;
  degraded: number | null;
  markets: number | null;
  cables: number | null;
  written: number;
  errors: string[];
}

/** kv write only when the JSON changed (one row read saved per unchanged key is cheaper than a write). */
async function putIfChanged(key: string, value: unknown): Promise<boolean> {
  const prev = await kvGet<unknown>(key);
  if (JSON.stringify(prev) === JSON.stringify(value)) return false;
  await kvSet(key, value);
  return true;
}

async function statusOf(p: StatusPage, now: number): Promise<ServiceStatus> {
  const meta = { id: p.id, name: p.name, url: p.url, group: p.group };
  try {
    let inc: Incident[];
    if (p.kind === "gcp") inc = parseGcpIncidents((await fetchJson(p.feed, { retries: 1 })).data);
    else if (p.kind === "aws") inc = parseAwsRss(await fetchText(p.feed), now);
    else inc = parseStatusAtom(await fetchText(p.feed), now);
    return summarise(meta, inc, now);
  } catch (e) {
    return { ...meta, state: "ok", open: [], last: null, error: (e as Error).message.slice(0, 160) };
  }
}

export async function checkSignals(opts: { force?: boolean } = {}): Promise<SignalsCheck | null> {
  const now = Date.now();
  if (!opts.force && now - ((await kvGet<number>("signals_checked_at")) ?? 0) < INTERVAL) return null;
  await kvSet("signals_checked_at", now);
  const res: SignalsCheck = { outages: null, degraded: null, markets: null, cables: null, written: 0, errors: [] };
  const wrote = (b: boolean) => void (b && res.written++);

  // internet outages, last 48h
  try {
    const from = Math.floor(now / 1000) - 48 * 3600;
    const { data } = await fetchJson(`https://api.ioda.inetintel.cc.gatech.edu/v2/outages/events?from=${from}&until=${Math.floor(now / 1000)}&entityType=country&limit=300`, { timeoutMs: 30_000 });
    const outages = parseIodaEvents(data, now);
    res.outages = outages.length;
    wrote(await putIfChanged("outages", outages));
  } catch (e) {
    res.errors.push(`ioda: ${(e as Error).message}`);
  }

  // service status (a few at a time — they're all different hosts)
  const limit = pLimit(4);
  const status = await Promise.all(STATUS_PAGES.map((p) => limit(() => statusOf(p, now))));
  for (const s of status) if (s.error) res.errors.push(`status ${s.id}: ${s.error}`);
  res.degraded = status.filter((s) => s.state === "degraded").length;
  wrote(await putIfChanged("service_status", status));

  // prediction markets
  if (opts.force || now - ((await kvGet<number>("markets_at")) ?? 0) > MARKETS_INTERVAL) {
    const all: Market[] = [];
    for (const lane of MARKET_LANES) {
      try {
        const { data } = await fetchJson(`https://gamma-api.polymarket.com/events?active=true&closed=false&tag_slug=${lane.tag}&order=volume24hr&ascending=false&limit=15`, { timeoutMs: 40_000, retries: 1 });
        all.push(...parsePolymarket(data, lane.tag));
      } catch (e) {
        res.errors.push(`polymarket ${lane.tag}: ${(e as Error).message}`);
      }
    }
    if (all.length) {
      // an event can carry several lane tags — keep its first lane
      const seen = new Set<string>();
      const markets = all.filter((m) => !seen.has(m.id) && seen.add(m.id));
      res.markets = markets.length;
      wrote(await putIfChanged("markets", markets));
      await kvSet("markets_at", now);
    }
  }

  // submarine cables (static map data) — weekly
  if (opts.force || now - ((await kvGet<number>("cables_at")) ?? 0) > 7 * 24 * 60 * MIN) {
    try {
      const cables = simplifyCables((await fetchJson(CABLES_URL, { timeoutMs: 40_000 })).data);
      res.cables = cables.features.length;
      wrote(await putIfChanged("cables", cables));
      await kvSet("cables_at", now);
    } catch (e) {
      res.errors.push(`cables: ${(e as Error).message}`);
    }
  }
  return res;
}
