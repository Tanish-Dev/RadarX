/**
 * Country gazetteer for briefings + the instability index: [iso2, name, currency, [minLat, minLon, maxLat, maxLon], ...aliases].
 * Points resolve to the SMALLEST bounding box that contains them (so Singapore beats Malaysia, Israel beats Jordan);
 * boxes are approximate — good for city-level placement of jobs, news and hazards, not for border disputes.
 * Aliases are matched (lowercase, whole word) inside job-location strings: "Berlin, Germany", "Remote - USA".
 */
type Row = [string, string, string, [number, number, number, number], ...string[]];

export const COUNTRIES: Row[] = [
  ["IN", "India", "INR", [6.5, 68, 35.7, 97.5], "india"],
  ["US", "United States", "USD", [24.5, -125, 49.5, -66.5], "united states", "usa", "u.s.", "u.s.a.", "us", "america"],
  ["GB", "United Kingdom", "GBP", [49.8, -8.7, 60.9, 1.8], "united kingdom", "uk", "u.k.", "england", "scotland", "wales", "great britain", "northern ireland"],
  ["CA", "Canada", "CAD", [41.6, -141, 70, -52.5], "canada"],
  ["DE", "Germany", "EUR", [47.2, 5.8, 55.1, 15.1], "germany", "deutschland"],
  ["FR", "France", "EUR", [41.3, -5.2, 51.2, 9.7], "france"],
  ["NL", "Netherlands", "EUR", [50.7, 3.3, 53.6, 7.3], "netherlands", "the netherlands", "holland"],
  ["IE", "Ireland", "EUR", [51.3, -10.7, 55.4, -5.9], "ireland"],
  ["ES", "Spain", "EUR", [35.9, -9.4, 43.9, 3.4], "spain"],
  ["PT", "Portugal", "EUR", [36.9, -9.6, 42.2, -6.2], "portugal"],
  ["IT", "Italy", "EUR", [36.6, 6.6, 47.1, 18.6], "italy"],
  ["CH", "Switzerland", "CHF", [45.8, 5.9, 47.9, 10.6], "switzerland"],
  ["AT", "Austria", "EUR", [46.4, 9.5, 49.1, 17.2], "austria"],
  ["BE", "Belgium", "EUR", [49.5, 2.5, 51.6, 6.4], "belgium"],
  ["SE", "Sweden", "SEK", [55.3, 11, 69.1, 24.2], "sweden"],
  ["NO", "Norway", "NOK", [58, 4.5, 71.2, 31], "norway"],
  ["DK", "Denmark", "DKK", [54.5, 8, 57.8, 12.7], "denmark"],
  ["FI", "Finland", "EUR", [59.8, 20.5, 70.1, 31.6], "finland"],
  ["PL", "Poland", "PLN", [49, 14.1, 54.9, 24.2], "poland"],
  ["CZ", "Czechia", "CZK", [48.5, 12, 51.1, 18.9], "czechia", "czech republic"],
  ["RO", "Romania", "RON", [43.6, 20.3, 48.3, 29.7], "romania"],
  ["UA", "Ukraine", "USD", [44.3, 22.1, 52.4, 40.2], "ukraine"],
  ["RU", "Russia", "USD", [41.2, 27, 81.9, 180], "russia"],
  ["TR", "Turkey", "TRY", [36, 26, 42.1, 44.8], "turkey", "türkiye", "turkiye"],
  ["IL", "Israel", "ILS", [29.5, 34.2, 33.3, 35.9], "israel"],
  ["AE", "United Arab Emirates", "AED", [22.6, 51.5, 26.1, 56.4], "united arab emirates", "uae", "dubai", "abu dhabi"],
  ["SA", "Saudi Arabia", "USD", [16.3, 34.5, 32.2, 55.7], "saudi arabia", "ksa"],
  ["QA", "Qatar", "USD", [24.4, 50.7, 26.2, 51.7], "qatar"],
  ["EG", "Egypt", "USD", [22, 25, 31.7, 34.9], "egypt"],
  ["ZA", "South Africa", "ZAR", [-34.9, 16.4, -22.1, 32.9], "south africa"],
  ["NG", "Nigeria", "USD", [4.2, 2.7, 13.9, 14.7], "nigeria"],
  ["KE", "Kenya", "USD", [-4.7, 33.9, 5, 41.9], "kenya"],
  ["PK", "Pakistan", "USD", [23.6, 60.9, 37.1, 77.8], "pakistan"],
  ["BD", "Bangladesh", "USD", [20.7, 88, 26.6, 92.7], "bangladesh"],
  ["LK", "Sri Lanka", "USD", [5.9, 79.5, 9.9, 81.9], "sri lanka"],
  ["NP", "Nepal", "USD", [26.3, 80, 30.5, 88.2], "nepal"],
  ["CN", "China", "CNY", [18, 73.5, 53.6, 134.8], "china", "prc"],
  ["HK", "Hong Kong", "HKD", [22.15, 113.8, 22.6, 114.45], "hong kong"],
  ["TW", "Taiwan", "USD", [21.8, 119.3, 25.4, 122.1], "taiwan"],
  ["JP", "Japan", "JPY", [30.2, 129.3, 45.6, 145.8], "japan"],
  ["KR", "South Korea", "KRW", [33.1, 125.1, 38.7, 129.6], "south korea", "korea", "republic of korea"],
  ["SG", "Singapore", "SGD", [1.15, 103.6, 1.5, 104.1], "singapore"],
  ["MY", "Malaysia", "MYR", [0.8, 99.6, 7.4, 119.3], "malaysia"],
  ["ID", "Indonesia", "IDR", [-11, 95, 6.1, 141], "indonesia"],
  ["TH", "Thailand", "THB", [5.6, 97.3, 20.5, 105.7], "thailand"],
  ["VN", "Vietnam", "USD", [8.4, 102.1, 23.4, 109.5], "vietnam", "viet nam"],
  ["PH", "Philippines", "PHP", [4.6, 116.9, 21.2, 126.6], "philippines"],
  ["AU", "Australia", "AUD", [-43.7, 113.2, -10.6, 153.7], "australia"],
  ["NZ", "New Zealand", "NZD", [-47.3, 166.4, -34.4, 178.6], "new zealand"],
  ["MX", "Mexico", "MXN", [14.5, -118.5, 32.7, -86.7], "mexico", "méxico"],
  ["BR", "Brazil", "BRL", [-33.8, -74, 5.3, -34.8], "brazil", "brasil"],
  ["AR", "Argentina", "USD", [-55, -73.6, -21.8, -53.6], "argentina"],
  ["CL", "Chile", "USD", [-56, -75.7, -17.5, -66.4], "chile"],
  ["CO", "Colombia", "USD", [-4.2, -79, 13.4, -66.8], "colombia"],
  ["PE", "Peru", "USD", [-18.4, -81.4, -0.04, -68.7], "peru"],
  ["IR", "Iran", "USD", [25, 44, 39.8, 63.3], "iran"],
  ["IQ", "Iraq", "USD", [29, 38.8, 37.4, 48.6], "iraq"],
  ["AF", "Afghanistan", "USD", [29.4, 60.5, 38.5, 74.9], "afghanistan"],
  ["MM", "Myanmar", "USD", [9.6, 92.2, 28.5, 101.2], "myanmar", "burma"],
  ["JO", "Jordan", "USD", [29.2, 34.9, 33.4, 39.3], "jordan"],
  ["LB", "Lebanon", "USD", [33, 35.1, 34.7, 36.6], "lebanon"],
  ["SY", "Syria", "USD", [32.3, 35.7, 37.3, 42.4], "syria"],
  ["YE", "Yemen", "USD", [12.1, 42.5, 19, 54.5], "yemen"],
  ["GR", "Greece", "EUR", [34.8, 19.4, 41.8, 28.3], "greece"],
  ["HU", "Hungary", "USD", [45.7, 16.1, 48.6, 22.9], "hungary"],
  ["BG", "Bulgaria", "USD", [41.2, 22.4, 44.2, 28.6], "bulgaria"],
  ["EE", "Estonia", "EUR", [57.5, 21.8, 59.7, 28.2], "estonia"],
  ["LT", "Lithuania", "EUR", [53.9, 20.9, 56.5, 26.8], "lithuania"],
  ["CR", "Costa Rica", "USD", [8, -86, 11.2, -82.5], "costa rica"],
];

const BY_ISO = new Map(COUNTRIES.map((c) => [c[0], c]));
const area = (b: [number, number, number, number]) => (b[2] - b[0]) * (b[3] - b[1]);
const BY_SIZE = [...COUNTRIES].sort((a, b) => area(a[3]) - area(b[3]));

export interface Country {
  iso: string;
  name: string;
  currency: string;
  flag: string;
  bbox: [number, number, number, number];
}

const flag = (iso: string) => String.fromCodePoint(...[...iso].map((c) => 0x1f1a5 + c.charCodeAt(0)));
const toCountry = (r: Row): Country => ({ iso: r[0], name: r[1], currency: r[2], flag: flag(r[0]), bbox: r[3] });

export const countryByIso = (iso: string): Country | null => {
  const r = BY_ISO.get(iso.toUpperCase());
  return r ? toCountry(r) : null;
};

/** Smallest country box containing the point; null over open water / unlisted countries. */
export function countryOfPoint(lat: number, lon: number): Country | null {
  for (const r of BY_SIZE) {
    const [a, b, c, d] = r[3];
    if (lat >= a && lat <= c && lon >= b && lon <= d) {
      return toCountry(r);
    }
  }
  return null;
}

const ALIASES: [RegExp, string][] = COUNTRIES.flatMap((r) => r.slice(4).map((a) => [new RegExp(`(?:^|[^a-z])${(a as string).replace(/[.]/g, "\\.")}(?:$|[^a-z])`), r[0]] as [RegExp, string]));

/** Country named inside a job-location string ("Berlin, Germany", "Remote - USA"); null if none is spelled out. */
export function countryInText(text: string): Country | null {
  const t = text.toLowerCase();
  // prefer the last comma part (the country slot), then anywhere
  const last = t.split(",").pop()!.trim();
  for (const scope of [last, t]) {
    for (const [re, iso] of ALIASES) if (re.test(scope)) return countryByIso(iso);
  }
  return null;
}

/** Stored as the nearest classification the data allows: spelled-out country first, else a geocoded city's box. */
export function countryOfLocation(location: string, geo: (loc: string) => { lat: number; lon: number }[]): Country | null {
  const named = countryInText(location);
  if (named) return named;
  const g = geo(location)[0];
  return g ? countryOfPoint(g.lat, g.lon) : null;
}
