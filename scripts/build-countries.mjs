/**
 * One-off: shrink Natural Earth 1:110m admin-0 countries (public domain) into public/countries-110m.json for the
 * map's hover/select layer. Keeps only { iso, name } and 2-decimal coordinates.
 *   curl -L -o ne110.geojson https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@v5.1.2/geojson/ne_110m_admin_0_countries.geojson
 *   node scripts/build-countries.mjs ne110.geojson
 */
import { readFileSync, writeFileSync } from "node:fs";

const src = JSON.parse(readFileSync(process.argv[2], "utf8"));
const r = (n) => Math.round(n * 100) / 100;
const ring = (pts) => pts.map(([x, y]) => [r(x), r(y)]).filter((p, i, a) => i === 0 || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
const features = [];
for (const f of src.features) {
  const p = f.properties;
  // ISO_A2 is "-99" for a few (France, Norway, Kosovo…); the *_EH variant fills them in
  const iso = [p.ISO_A2_EH, p.ISO_A2, p.WB_A2].find((v) => typeof v === "string" && /^[A-Z]{2}$/.test(v));
  if (!iso || iso === "AQ") continue; // Antarctica is noise on this map
  const g = f.geometry;
  const coordinates = g.type === "Polygon" ? g.coordinates.map(ring) : g.coordinates.map((poly) => poly.map(ring));
  features.push({ type: "Feature", properties: { iso, name: p.NAME || p.NAME_EN }, geometry: { type: g.type, coordinates } });
}
writeFileSync(new URL("../public/countries-110m.json", import.meta.url), JSON.stringify({ type: "FeatureCollection", features }));
console.log(`${features.length} countries`);
