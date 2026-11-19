/**
 * World Monitor+ parsers (pure; tests/signals.test.ts): IODA internet outages, service status (Statuspage Atom,
 * Google Cloud incidents.json, AWS RSS), Polymarket prediction markets, submarine cables, and news keyword surges.
 * Parsers throw on unexpected shapes.
 */
import type { MarketLane } from "../data/infra";
import { parseFeed } from "./news";

const H = 3_600_000;
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

// ── internet outages (IODA, Georgia Tech) ───────────────────────────────────
export interface Outage {
  /** ISO-3166 alpha-2 */
  iso: string;
  name: string;
  start: number;
  end: number;
  ongoing: boolean;
  /** summed IODA score of the country's events */
  score: number;
  /** IODA signals that saw it: bgp (routing), ping-slash24 (active probing), merit-nt (telescope), gtr (Google traffic) */
  signals: string[];
  level: "major" | "moderate" | "minor";
}

const SIGNAL_LABEL: Record<string, string> = { bgp: "BGP routes", "ping-slash24": "active probing", "merit-nt": "network telescope", gtr: "Google traffic" };
export const signalLabel = (s: string) => SIGNAL_LABEL[s] ?? s;

export const outageLevel = (score: number): Outage["level"] => (score >= 20_000 ? "major" : score >= 5_000 ? "moderate" : "minor");

/** IODA `/v2/outages/events?entityType=country` → one row per country (events merged), strongest first. */
export function parseIodaEvents(o: unknown, now = Date.now()): Outage[] {
  const r = o as { data?: unknown };
  if (!r || !Array.isArray(r.data)) throw new Error("ioda: no data array — unexpected shape");
  const by = new Map<string, Outage>();
  for (const e of r.data as any[]) {
    if (typeof e?.location !== "string" || !finite(e.start) || !finite(e.duration)) throw new Error("ioda: event missing location/start/duration — unexpected shape");
    const m = e.location.match(/^country\/([A-Z]{2})$/);
    if (!m) continue;
    const start = e.start * 1000, end = (e.start + e.duration) * 1000;
    const cur: Outage = by.get(m[1]) ?? { iso: m[1], name: String(e.location_name ?? m[1]), start, end, ongoing: false, score: 0, signals: [], level: "minor" };
    cur.start = Math.min(cur.start, start);
    cur.end = Math.max(cur.end, end);
    cur.score += finite(e.score) ? e.score : 0;
    if (e.datasource && !cur.signals.includes(e.datasource)) cur.signals.push(String(e.datasource));
    by.set(m[1], cur);
  }
  return [...by.values()]
    .map((x) => ({ ...x, score: Math.round(x.score), ongoing: now - x.end < 45 * 60_000, level: outageLevel(x.score) }))
    .sort((a, b) => Number(b.ongoing) - Number(a.ongoing) || b.score - a.score);
}

// ── service status ──────────────────────────────────────────────────────────
export type Phase = "investigating" | "identified" | "monitoring" | "update" | "resolved" | "scheduled" | "maintenance";
export interface Incident {
  title: string;
  url: string;
  ts: number;
  phase: Phase;
  open: boolean;
}

const PHASE_RE = /\b(Resolved|Completed|Postmortem|Investigating|Identified|Monitoring|Update|Scheduled|In progress|Verifying)\b/;
function phaseOf(text: string): Phase {
  const p = text.match(PHASE_RE)?.[1]?.toLowerCase() ?? "update";
  if (p === "completed" || p === "postmortem" || p === "resolved") return "resolved";
  if (p === "in progress" || p === "verifying") return "maintenance";
  return p as Phase;
}

/** Statuspage `history.atom`: the summary starts with the latest update ("Nov 18, 09:34 UTC Resolved - …"). */
export function parseStatusAtom(xml: string, now = Date.now()): Incident[] {
  return parseFeed(xml).map((it) => {
    const phase = phaseOf(it.summary);
    const ts = it.publishedAt ?? 0;
    // a stale entry that never got a "Resolved" update isn't a live incident
    const open = phase !== "resolved" && phase !== "scheduled" && now - ts < 3 * 24 * H;
    return { title: it.title, url: it.url, ts, phase, open };
  });
}

/** Google Cloud `incidents.json` (newest first). Open = no `end`. */
export function parseGcpIncidents(o: unknown): Incident[] {
  if (!Array.isArray(o)) throw new Error("gcp: not an array — unexpected shape");
  return (o as any[]).map((x) => {
    if (typeof x?.external_desc !== "string" || typeof x?.begin !== "string") throw new Error("gcp: incident missing desc/begin — unexpected shape");
    const open = !x.end;
    const ts = Date.parse(x.modified ?? x.begin);
    return { title: x.external_desc.trim(), url: `https://status.cloud.google.com/${String(x.uri ?? "")}`, ts: Number.isFinite(ts) ? ts : Date.parse(x.begin), phase: open ? "update" : "resolved", open };
  });
}

/** AWS all-services RSS. Items carry no resolution state, so only very recent ones count as open. */
export function parseAwsRss(xml: string, now = Date.now()): Incident[] {
  return parseFeed(xml).map((it) => {
    const ts = it.publishedAt ?? 0;
    const resolved = /\[RESOLVED\]|operating normally|has been resolved|recovered/i.test(`${it.title} ${it.summary}`);
    const region = it.summary.match(/\(([a-z]{2}-[a-z]+-\d)\)/)?.[1];
    return { title: region ? `${it.title} · ${region}` : it.title, url: it.url, ts, phase: resolved ? "resolved" : "update", open: !resolved && now - ts < 6 * H };
  });
}

export interface ServiceStatus {
  id: string;
  name: string;
  url: string;
  group: string;
  state: "ok" | "degraded" | "recovered";
  open: Incident[];
  /** latest incident in the last 7 days */
  last: Incident | null;
  error: string | null;
}

export function summarise(meta: { id: string; name: string; url: string; group: string }, incidents: Incident[], now = Date.now()): ServiceStatus {
  // planned maintenance announcements aren't incidents (and can be dated in the future)
  const recent = incidents.filter((i) => i.phase !== "scheduled" && i.phase !== "maintenance" && i.ts <= now && now - i.ts < 7 * 24 * H).sort((a, b) => b.ts - a.ts);
  const open = recent.filter((i) => i.open);
  const state = open.length ? "degraded" : recent.some((i) => now - i.ts < 24 * H) ? "recovered" : "ok";
  return { ...meta, state, open, last: recent[0] ?? null, error: null };
}

// ── prediction markets (Polymarket gamma API) ───────────────────────────────
export interface Outcome {
  label: string;
  /** 0–1 */
  p: number;
  /** 24h change in probability points (0–1), when given */
  change: number | null;
}
export interface Market {
  id: string;
  lane: MarketLane;
  title: string;
  url: string;
  volume24h: number;
  endDate: string | null;
  outcomes: Outcome[];
  /** "by date" / "above threshold" ladder: outcomes are in ladder order, not most-likely-first */
  ladder: boolean;
  tags: string[];
}

// celebrity gossip and sports games share the tags; they aren't signals
const NOISE_RE = /\b(divorce|affair|dating|girlfriend|boyfriend|pregnan\w*|baby|shake hands|handshake|tweets?|say .+ during|mentions?|vs\.?|wins? the game|elon .+ post|searched|most followed)\b/i;

const DATE_RE = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b|\bq[1-4]\b|\b20\d\d\b/i;
/** first number in a rung label: "$1.25–$1.5T" → 1.25, "↑$2.0T" → 2, "25 bps" → 25 */
function ladderNumber(label: string): number | null {
  const m = label.replace(/,/g, "").match(/(<|>|≤|≥)?\s*\$?(\d+(?:\.\d+)?)/);
  if (!m) return null;
  return Number(m[2]) - (m[1] === "<" || m[1] === "≤" ? 0.001 : 0);
}

const prices = (v: unknown): number[] => {
  const a = typeof v === "string" ? JSON.parse(v) : v;
  return Array.isArray(a) ? a.map(Number) : [];
};

export function parsePolymarket(o: unknown, lane: MarketLane): Market[] {
  if (!Array.isArray(o)) throw new Error("polymarket: not an array — unexpected shape");
  const out: Market[] = [];
  for (const e of o as any[]) {
    if (typeof e?.title !== "string" || typeof e?.slug !== "string" || !Array.isArray(e.markets)) throw new Error("polymarket: event missing title/slug/markets — unexpected shape");
    if (e.closed || NOISE_RE.test(e.title)) continue;
    const tags = (e.tags ?? []).map((t: any) => String(t?.label ?? "")).filter(Boolean);
    if (tags.some((t: string) => /^(sports|nba|nfl|soccer|games)$/i.test(t))) continue;
    const live = e.markets.filter((m: any) => m && !m.closed && m.active !== false);
    let outcomes: Outcome[];
    let ladder = false;
    if (live.length === 1 && !live[0].groupItemTitle) {
      const raw = typeof live[0].outcomes === "string" ? JSON.parse(live[0].outcomes) : live[0].outcomes;
      const names: unknown[] = Array.isArray(raw) ? raw : ["Yes", "No"];
      const p = prices(live[0].outcomePrices)[0];
      outcomes = [{ label: String(names[0] ?? "Yes"), p, change: finite(live[0].oneDayPriceChange) ? live[0].oneDayPriceChange : null }];
    } else {
      const rows = live
        .map((m: any) => ({ label: String(m.groupItemTitle || m.question || ""), p: prices(m.outcomePrices)[0], change: finite(m.oneDayPriceChange) ? m.oneDayPriceChange : null, end: Date.parse(m.endDate ?? ""), num: ladderNumber(String(m.groupItemTitle ?? "")) }))
        .filter((x: Outcome) => x.label && finite(x.p));
      // ladders ("ceasefire by Nov 30 / Dec 31", "above $1.5T / $2T") read in order; pick the rungs where the market is undecided
      const byDate = rows.length > 1 && rows.every((x: any) => DATE_RE.test(x.label) && Number.isFinite(x.end)) && new Set(rows.map((x: any) => x.end)).size === rows.length;
      const byNum = !byDate && rows.length > 1 && rows.every((x: any) => x.num != null && !/[a-z]{4,}/i.test(x.label.replace(/\b(above|below|over|under|bps|increase|decrease)\b/gi, "")));
      ladder = byDate || byNum;
      if (ladder) {
        rows.sort((a: any, b: any) => (byDate ? a.end - b.end : a.num - b.num));
        const mid = rows.filter((x: Outcome) => x.p >= 0.03 && x.p <= 0.97);
        outcomes = (mid.length ? mid : rows).slice(0, 3);
      } else {
        outcomes = rows.filter((x: Outcome) => x.p > 0.005 && x.p < 0.995).sort((a: Outcome, b: Outcome) => b.p - a.p).slice(0, 3);
      }
      outcomes = outcomes.map(({ label, p, change }) => ({ label, p, change }));
    }
    if (!outcomes.length || !outcomes.every((x) => finite(x.p))) continue;
    out.push({ id: String(e.id ?? e.slug), lane, title: e.title.trim(), url: `https://polymarket.com/event/${encodeURIComponent(e.slug)}`, volume24h: Math.round(Number(e.volume24hr) || 0), endDate: typeof e.endDate === "string" ? e.endDate : null, outcomes, ladder, tags: tags.slice(0, 6) });
  }
  return out;
}

// ── submarine cables ────────────────────────────────────────────────────────
export interface CableCollection {
  type: "FeatureCollection";
  features: { type: "Feature"; properties: { name: string; color: string }; geometry: { type: "MultiLineString"; coordinates: number[][][] } }[];
}

/** Shrink TeleGeography's cable GeoJSON for the map: 0.1° precision, consecutive duplicates dropped. */
export function simplifyCables(o: unknown): CableCollection {
  const fc = o as { type?: string; features?: unknown };
  if (!fc || fc.type !== "FeatureCollection" || !Array.isArray(fc.features)) throw new Error("cables: not a FeatureCollection — unexpected shape");
  const r = (n: number) => Math.round(n * 10) / 10;
  const features: CableCollection["features"] = [];
  for (const f of fc.features as any[]) {
    const g = f?.geometry;
    if (!g || !Array.isArray(g.coordinates)) throw new Error("cables: feature missing geometry — unexpected shape");
    const lines: number[][][] = g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : [];
    const out = lines
      .map((line) => line.reduce<number[][]>((acc, [x, y]) => {
        const p = [r(x), r(y)];
        const q = acc[acc.length - 1];
        if (!q || q[0] !== p[0] || q[1] !== p[1]) acc.push(p);
        return acc;
      }, []))
      .filter((l) => l.length >= 2);
    if (!out.length) continue;
    const color = typeof f.properties?.color === "string" && /^#[0-9a-f]{3,8}$/i.test(f.properties.color) ? f.properties.color : "#6aa8ff";
    features.push({ type: "Feature", properties: { name: String(f.properties?.name ?? ""), color }, geometry: { type: "MultiLineString", coordinates: out } });
  }
  return { type: "FeatureCollection", features };
}

// ── surging topics in the news ──────────────────────────────────────────────
export interface Headline {
  source: string;
  kind: string;
  title: string;
  url: string;
  ts: number;
}
export interface Surge {
  /** lead term + the terms that travel with it in the same headlines ("musk · midterm · foolish") */
  term: string;
  related: string[];
  /** distinct outlets using it in the recent window */
  outlets: number;
  /** average outlets per window over the baseline */
  baseline: number;
  ratio: number;
  kind: "tech" | "world" | "mixed";
  sample: { title: string; url: string; source: string }[];
}

// headline filler + generic nouns that spike by coincidence ("court", "home", "risk") rather than because of one story
const SURGE_STOP = new Set(
  `the a an and or of to in on for with at by from as is are was were be been it its this that after over into amid says said say new news live latest update updates more than about how why what who will would could can may first two three four five year years week day days off out up down vs but not has have had his her their they we you he she them our just now get gets got make makes made back top best big one ago amp here there when where which while also still even report reports reported video watch photos photo today tonight yesterday tomorrow monday tuesday wednesday thursday friday saturday sunday people world govt government official officials plan plans call calls set sets take takes deal deals time last next million billion percent
   court courts supreme home homes risk risks order orders security meeting meetings talk talks claim claims warn warns tell tells told flag flags high higher low lower state states city country public market markets price prices case cases rule rules law laws police team help helps move moves need needs want wants look looks show shows open opens close closes start starts end ends come comes going goes give gives keep keeps work works life part side point year-old former major key amid against before during under without within across around again many much most some such than very well like into only other into another every never ever being does done doing week-long month months hour hours minute minutes second seconds man woman men women child children family families group groups member members leader leaders chief head heads issue issues question questions crore crores lakh rupee rupees feel feels felt beyond within among behind toward towards really thing things way ways lot seek seeks sought meet meets met pretty foolish quite`.split(/\s+/),
);

/** Title terms: lowercase words (≥4 letters) + short acronyms ("AI", "GPU", "UN"). */
export function surgeTerms(title: string): Set<string> {
  const out = new Set<string>();
  for (const m of title.matchAll(/\b[A-Z]{2,5}\b/g)) if (!SURGE_STOP.has(m[0].toLowerCase())) out.add(m[0]);
  for (const w of title.toLowerCase().replace(/['’]s\b/g, "").split(/[^a-z0-9-]+/)) {
    if (w.length < 4 || SURGE_STOP.has(w) || /^[\d-]+$/.test(w)) continue;
    const stem = w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w;
    if (!SURGE_STOP.has(stem)) out.add(stem);
  }
  return out;
}

/**
 * Terms that many outlets suddenly use: distinct outlets in the last `windowH` hours vs the average per window over
 * the previous `baselineH` hours. Needs ≥ `minOutlets` outlets and ≥ `minRatio`× the baseline. Terms that come from
 * the same headlines are merged into one surge (the strongest leads).
 */
export function findSurges(items: Headline[], now = Date.now(), { windowH = 6, baselineH = 7 * 24, minOutlets = 3, minRatio = 3 } = {}): Surge[] {
  const recent = new Map<string, { outlets: Set<string>; kinds: Map<string, number>; heads: Headline[] }>();
  const base = new Map<string, number>();
  const wStart = now - windowH * H, bStart = wStart - baselineH * H;
  // baseline counts distinct (outlet, window-slot) pairs so one prolific outlet can't fake a long-running topic
  const baseSeen = new Set<string>();
  for (const it of items) {
    if (it.ts > now || it.ts < bStart) continue;
    const terms = surgeTerms(it.title);
    if (it.ts >= wStart) {
      for (const t of terms) {
        const e = recent.get(t) ?? recent.set(t, { outlets: new Set(), kinds: new Map(), heads: [] }).get(t)!;
        e.heads.push(it);
        e.outlets.add(it.source);
        e.kinds.set(it.kind, (e.kinds.get(it.kind) ?? 0) + 1);
      }
    } else {
      const slot = Math.floor((it.ts - bStart) / (windowH * H));
      for (const t of terms) {
        const k = `${t}|${it.source}|${slot}`;
        if (baseSeen.has(k)) continue;
        baseSeen.add(k);
        base.set(t, (base.get(t) ?? 0) + 1);
      }
    }
  }
  const slots = baselineH / windowH;
  type Cand = Surge & { urls: Set<string> };
  const cands: Cand[] = [];
  for (const [term, e] of recent) {
    const n = e.outlets.size;
    if (n < minOutlets) continue;
    const baseline = (base.get(term) ?? 0) / slots;
    const ratio = (n + 0.5) / (baseline + 0.5);
    if (ratio < minRatio) continue;
    const total = [...e.kinds.values()].reduce((a, b) => a + b, 0);
    const lead = [...e.kinds].sort((a, b) => b[1] - a[1])[0];
    const kind = lead[1] / total >= 0.75 ? (lead[0] as "tech" | "world") : "mixed";
    // one headline per outlet, newest first
    const per = new Map<string, Headline>();
    for (const hd of [...e.heads].sort((a, b) => b.ts - a.ts)) if (!per.has(hd.source)) per.set(hd.source, hd);
    cands.push({ term, related: [], outlets: n, baseline: Math.round(baseline * 10) / 10, ratio: Math.round(ratio * 10) / 10, kind, sample: [...per.values()].slice(0, 3).map(({ title, url, source }) => ({ title, url, source })), urls: new Set(e.heads.map((x) => x.url)) });
  }
  cands.sort((a, b) => b.outlets * Math.log2(1 + b.ratio) - a.outlets * Math.log2(1 + a.ratio));
  const kept: Cand[] = [];
  for (const s of cands) {
    // same story? most of this term's headlines already belong to a stronger surge
    const host = kept.find((k) => {
      let shared = 0;
      for (const u of s.urls) if (k.urls.has(u)) shared++;
      return shared / Math.min(s.urls.size, k.urls.size) >= 0.6;
    });
    if (host) {
      if (host.related.length < 3) host.related.push(s.term);
      continue;
    }
    kept.push(s);
  }
  return kept.map(({ urls: _urls, ...s }) => s);
}
