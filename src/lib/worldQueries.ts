/** Server reads for world signals (quakes, natural events, FX) — shown on the map, Home and /world. */
import "server-only";
import { db, kvGet } from "./db";
import { getMapPoints } from "./queries";
import { ago, agoShort } from "./time";
import { km, reachKm, type FxSeries, type HazardKind } from "./world";

export interface HazardView {
  id: string;
  kind: HazardKind;
  title: string;
  mag: number | null;
  lat: number;
  lon: number;
  ts: number;
  ago: string;
  agoShort: string;
  url: string | null;
  /** 0–3: how loud this should be on the map */
  severity: 1 | 2 | 3;
}

const severity = (kind: HazardKind, mag: number | null): 1 | 2 | 3 => (kind === "quake" ? ((mag ?? 0) >= 6 ? 3 : (mag ?? 0) >= 5.2 ? 2 : 1) : kind === "volcano" || kind === "storm" ? 2 : 1);

export async function getHazards(hours = 72, minMag = 4.5): Promise<HazardView[]> {
  const c = await db();
  const now = Date.now();
  const r = await c.execute({
    sql: `SELECT id, kind, title, mag, lat, lon, ts, url FROM hazards WHERE (active = 1 OR ts >= ?) AND ts >= ? AND (kind != 'quake' OR mag >= ?) ORDER BY ts DESC LIMIT 300`,
    args: [now - hours * 3_600_000, now - 20 * 86_400_000, minMag],
  });
  return r.rows.map((x) => {
    const kind = String(x.kind) as HazardKind;
    const mag = x.mag == null ? null : Number(x.mag);
    return { id: String(x.id), kind, title: String(x.title), mag, lat: Number(x.lat), lon: Number(x.lon), ts: Number(x.ts), ago: ago(Number(x.ts), now), agoShort: agoShort(Number(x.ts), now), url: x.url == null ? null : String(x.url), severity: severity(kind, mag) };
  });
}

export interface HubRisk {
  city: string;
  roles: number;
  india: boolean;
  hazard: HazardView;
  distanceKm: number;
}

/** Job hubs (cities with recent tech postings) that sit inside a hazard's reach — personalised to where roles actually are. */
export async function getHubRisks(hazards: HazardView[]): Promise<HubRisk[]> {
  if (!hazards.length) return [];
  const { points } = await getMapPoints(24 * 7);
  const out = new Map<string, HubRisk>();
  for (const p of points) {
    for (const h of hazards) {
      if (h.severity < 2 && h.kind === "quake") continue;
      const d = km(p.lat, p.lon, h.lat, h.lon);
      if (d > reachKm(h)) continue;
      const cur = out.get(p.city);
      if (!cur || d < cur.distanceKm) out.set(p.city, { city: p.city, roles: p.count, india: p.india, hazard: h, distanceKm: Math.round(d) });
    }
  }
  return [...out.values()].sort((a, b) => b.roles - a.roles);
}

export async function getFx(): Promise<{ fx: FxSeries | null; at: string | null }> {
  const [fx, at] = await Promise.all([kvGet<FxSeries>("fx"), kvGet<number>("fx_at")]);
  return { fx, at: at ? ago(at) : null };
}
