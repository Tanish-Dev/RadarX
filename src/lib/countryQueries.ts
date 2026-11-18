/** Server reads for country briefings + the instability board (news × hazards × roles per country). */
import "server-only";
import { CITIES, geocode } from "../data/cities";
import { COUNTRIES, countryByIso, countryOfLocation, countryOfPoint, type Country } from "../data/countries";
import { db, kvGet } from "./db";
import { hazardWeight, isUnrest, scoreOf, storyWeight, type Score, type Signals } from "./instability";
import { loadStories, type NewsItem } from "./newsQueries";
import { ONE_PER_ROLE, getJobs } from "./queries";
import type { FxSeries } from "./world";
import { getHazards, type HazardView } from "./worldQueries";

const H = 3_600_000;
const EARLY = new Set(["intern", "newgrad", "research"]);

export interface BoardRow {
  country: Country;
  score: Score;
  /** score 24h ago (same windows, shifted) */
  prev: number;
  /** change vs 24h ago; null until RadarX has ≥ 60h of news history (earlier windows would be incomplete) */
  delta: number | null;
  roles: number;
  early: number;
  stories: number;
  topHeadline: string | null;
}

interface Snapshot {
  at: number;
  rows: BoardRow[];
  stories: NewsItem[];
  hazards: HazardView[];
}
let cache: Snapshot | null = null;

type HazardPoint = { iso: string | null; kind: string; mag: number | null; ts: number };

function signalsAt(iso: string, stories: (NewsItem & { iso: string | null })[], haz: HazardPoint[], end: number): Signals {
  const s: Signals = { unrest: 0, hazard: 0, attention: 0 };
  for (const st of stories) {
    if (st.iso !== iso || st.ts > end || st.ts < end - 48 * H) continue;
    const w = storyWeight(st.coverage);
    s.attention += w;
    if (st.kind === "world" && isUnrest(st.title)) s.unrest += w;
  }
  for (const h of haz) if (h.iso === iso && h.ts <= end && h.ts >= end - 72 * H) s.hazard += hazardWeight(h.kind, h.mag);
  return s;
}

/** Tech roles per country (memoised per distinct location string). */
async function jobGeo() {
  const c = await db();
  const r = await c.execute(`SELECT location, company, level, COUNT(*) n FROM jobs WHERE active = 1 AND dismissed = 0 AND is_tech = 1 AND ${ONE_PER_ROLE} GROUP BY location, company, level`);
  const memo = new Map<string, string | null>();
  return r.rows.flatMap((row) => {
    const loc = String(row.location ?? "");
    if (!memo.has(loc)) memo.set(loc, countryOfLocation(loc, geocode)?.iso ?? null);
    const iso = memo.get(loc);
    return iso ? [{ iso, loc, company: String(row.company), early: EARLY.has(String(row.level)), n: Number(row.n) }] : [];
  });
}

async function snapshot(): Promise<Snapshot & { geo: Awaited<ReturnType<typeof jobGeo>> }> {
  const now = Date.now();
  const geo = await jobGeo();
  if (cache && now - cache.at < 60_000) return { ...cache, geo };
  const [raw, hazards, first] = await Promise.all([loadStories(24 * 4, now), getHazards(24 * 5, 4.5), (await db()).execute(`SELECT MIN(first_seen_at) t FROM news`)]);
  const deltaOk = now - Number(first.rows[0]?.t ?? now) >= 60 * H;
  const stories = raw.map((s) => ({ ...s, iso: s.lat != null && s.lon != null ? countryOfPoint(s.lat, s.lon)?.iso ?? null : null }));
  const haz: HazardPoint[] = hazards.map((h) => ({ iso: countryOfPoint(h.lat, h.lon)?.iso ?? null, kind: h.kind, mag: h.mag, ts: h.ts }));
  const roles = new Map<string, { roles: number; early: number }>();
  for (const g of geo) {
    const e = roles.get(g.iso) ?? roles.set(g.iso, { roles: 0, early: 0 }).get(g.iso)!;
    e.roles += g.n;
    if (g.early) e.early += g.n;
  }
  const rows: BoardRow[] = [];
  for (const [iso] of COUNTRIES.map((c) => [c[0]] as const)) {
    const cur = signalsAt(iso, stories, haz, now);
    const info = roles.get(iso) ?? { roles: 0, early: 0 };
    if (!cur.attention && !cur.hazard && !info.roles) continue;
    const score = scoreOf(cur);
    const prev = scoreOf(signalsAt(iso, stories, haz, now - 24 * H)).total;
    const mine = stories.filter((s) => s.iso === iso && s.ts >= now - 48 * H);
    rows.push({ country: countryByIso(iso)!, score, prev, delta: deltaOk ? score.total - prev : null, roles: info.roles, early: info.early, stories: mine.length, topHeadline: mine.sort((a, b) => b.score - a.score)[0]?.title ?? null });
  }
  rows.sort((a, b) => b.score.total - a.score.total || b.roles - a.roles);
  cache = { at: now, rows, stories, hazards };
  return { ...cache, geo };
}

export const getCountryBoard = async () => (await snapshot()).rows;

export interface Briefing {
  row: BoardRow;
  headlines: NewsItem[];
  hazards: HazardView[];
  cities: { city: string; n: number }[];
  companies: { company: string; n: number }[];
  jobs: Awaited<ReturnType<typeof getJobs>>["jobs"];
  jobsTotal: number;
  /** `loc` filter for the Feed */
  loc: string;
  fx: { currency: string; perUsd: number; inr: number | null; history: number[] } | null;
}

export async function getCountryBriefing(iso: string): Promise<Briefing | null> {
  const country = countryByIso(iso);
  if (!country) return null;
  const snap = await snapshot();
  const row = snap.rows.find((r) => r.country.iso === country.iso) ?? {
    country, score: scoreOf({ unrest: 0, hazard: 0, attention: 0 }), prev: 0, delta: null, roles: 0, early: 0, stories: 0, topHeadline: null,
  };
  const inCountry = (lat: number | null, lon: number | null) => lat != null && lon != null && countryOfPoint(lat, lon)?.iso === country.iso;
  const headlines = snap.stories.filter((s) => inCountry(s.lat, s.lon)).sort((a, b) => b.score - a.score).slice(0, 8);
  const hazards = snap.hazards.filter((h) => inCountry(h.lat, h.lon));

  const cityN = new Map<string, number>(), coN = new Map<string, number>();
  for (const g of snap.geo) {
    if (g.iso !== country.iso) continue;
    const city = geocode(g.loc)[0]?.name;
    if (city) cityN.set(city, (cityN.get(city) ?? 0) + g.n);
    coN.set(g.company, (coN.get(g.company) ?? 0) + g.n);
  }
  const rank = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const cities = rank(cityN).map(([city, n]) => ({ city, n }));
  const companies = rank(coN).map(([company, n]) => ({ company, n }));

  // Feed filter: the country's name + the geocoder cities that fall inside it
  const cityNames = CITIES.filter((ci) => countryOfPoint(ci[1], ci[2])?.iso === country.iso).map((ci) => ci[0]).slice(0, 60);
  const loc = [country.name, ...cityNames].join("|");
  const jobs = await getJobs({ loc, level: ["intern", "newgrad", "research"], tech: true, sort: "new", within: "30d" }, { limit: 6 });

  const fx = await kvGet<FxSeries>("fx");
  const perUsd = fx ? (country.currency === "USD" ? 1 : fx.rates[country.currency]) : undefined;
  const fxOut =
    fx && perUsd && country.iso !== "IN"
      ? { currency: country.currency, perUsd, inr: fx.rates.INR ? fx.rates.INR / perUsd : null, history: country.currency === "USD" ? fx.history.INR ?? [] : fx.history[country.currency] ?? [] }
      : null;
  return { row, headlines, hazards, cities, companies, jobs: jobs.jobs, jobsTotal: jobs.total, loc, fx: fxOut };
}
