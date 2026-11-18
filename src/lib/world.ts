/** World-signal parsers (pure; tests/world.test.ts): USGS quakes, NASA EONET events, Frankfurter FX. Throw on unexpected shapes. */
export type HazardKind = "quake" | "storm" | "wildfire" | "volcano" | "flood" | "other";

export interface Hazard {
  id: string;
  kind: HazardKind;
  title: string;
  /** earthquake magnitude, else null */
  mag: number | null;
  lat: number;
  lon: number;
  /** event time, ms */
  ts: number;
  url: string | null;
}

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

export function parseUsgs(o: unknown): Hazard[] {
  const fc = o as { type?: string; features?: unknown };
  if (!fc || fc.type !== "FeatureCollection" || !Array.isArray(fc.features)) throw new Error("usgs: not a FeatureCollection — unexpected shape");
  const out: Hazard[] = [];
  for (const f of fc.features as any[]) {
    const [lon, lat] = f?.geometry?.coordinates ?? [];
    const p = f?.properties;
    if (!f?.id || !p || !finite(lon) || !finite(lat) || !finite(p.time)) throw new Error("usgs: feature missing id/coords/time — unexpected shape");
    if (!finite(p.mag)) continue; // unrated event
    out.push({ id: `usgs:${f.id}`, kind: "quake", title: String(p.title ?? `M ${p.mag} earthquake`), mag: p.mag, lat, lon, ts: p.time, url: typeof p.url === "string" ? p.url : null });
  }
  return out;
}

const EONET_KIND: Record<string, HazardKind> = { severeStorms: "storm", wildfires: "wildfire", volcanoes: "volcano", floods: "flood" };

/** First coordinate pair of a Point, or the mean of a Polygon's outer ring. */
function centre(g: any): [number, number] | null {
  const c = g?.coordinates;
  if (g?.type === "Point" && Array.isArray(c) && finite(c[0]) && finite(c[1])) return [c[0], c[1]];
  if (g?.type === "Polygon" && Array.isArray(c?.[0]) && c[0].length) {
    const ring = c[0] as number[][];
    return [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];
  }
  return null;
}

export function parseEonet(o: unknown): Hazard[] {
  const root = o as { events?: unknown };
  if (!root || !Array.isArray(root.events)) throw new Error("eonet: no events array — unexpected shape");
  const out: Hazard[] = [];
  for (const e of root.events as any[]) {
    if (!e?.id || !e?.title || !Array.isArray(e.geometry)) throw new Error("eonet: event missing id/title/geometry — unexpected shape");
    if (e.closed || /prescribed fire|\brx\b/i.test(String(e.title))) continue; // controlled burns aren't hazards
    // latest geometry that has a usable position
    const geoms = [...e.geometry].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    for (const g of geoms) {
      const at = centre(g);
      const ts = Date.parse(g.date);
      if (!at || !Number.isFinite(ts)) continue;
      const cat = String(e.categories?.[0]?.id ?? "");
      out.push({ id: `eonet:${e.id}`, kind: EONET_KIND[cat] ?? "other", title: String(e.title), mag: null, lat: at[1], lon: at[0], ts, url: typeof e.link === "string" ? e.link : null });
      break;
    }
  }
  return out;
}

export interface FxSeries {
  base: string;
  /** latest rate per currency */
  rates: Record<string, number>;
  /** oldest → newest INR-style history per currency */
  history: Record<string, number[]>;
  date: string;
}

export function parseFxSeries(o: unknown): FxSeries {
  const r = o as { base?: string; rates?: Record<string, Record<string, number>> };
  if (!r || typeof r.base !== "string" || !r.rates || typeof r.rates !== "object") throw new Error("fx: unexpected shape");
  const days = Object.keys(r.rates).sort();
  if (!days.length) throw new Error("fx: empty series");
  const history: Record<string, number[]> = {};
  for (const d of days) for (const [cur, v] of Object.entries(r.rates[d])) if (finite(v)) (history[cur] ??= []).push(v);
  const rates = Object.fromEntries(Object.entries(history).map(([c, h]) => [c, h[h.length - 1]]));
  return { base: r.base, rates, history, date: days[days.length - 1] };
}

/** Great-circle distance in km. */
export function km(aLat: number, aLon: number, bLat: number, bLon: number) {
  const rad = Math.PI / 180;
  const h = Math.sin(((bLat - aLat) * rad) / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(((bLon - aLon) * rad) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/** How close a hazard has to be to matter to a job hub: strong quakes reach further than a small one. */
export function reachKm(h: Pick<Hazard, "kind" | "mag">) {
  if (h.kind === "quake") return (h.mag ?? 0) >= 6 ? 400 : (h.mag ?? 0) >= 5 ? 200 : 100;
  return h.kind === "storm" ? 400 : 150;
}
