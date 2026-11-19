/** URL search params ⇄ job filters. Pure (no DB) so client components can use it too. */

export type Within = "1h" | "24h" | "7d" | "30d";
export type Sort = "new" | "match";

export interface JobFilters {
  q: string;
  loc: string;
  level: string[]; // intern | newgrad | research | experienced
  region: string[]; // india | remote | abroad
  domain: string[]; // ai | software | data | hardware | quant | security | design
  group: string;
  company: string;
  within: Within | "";
  tech: boolean;
  sort: Sort;
  page: number;
  view: "list" | "cards";
  job: string; // open detail panel
}

export type RawParams = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => ((Array.isArray(v) ? v[0] : v) ?? "").slice(0, 1000);
const list = (v: string | string[] | undefined) =>
  one(v)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

// Hard caps: these values reach SQL (always as bound parameters) — the caps stop a crafted URL from building
// a huge query (thousands of LIKE terms) that would tie up the database.
const LEVELS = ["intern", "newgrad", "research", "experienced"];
const REGIONS = ["india", "remote", "abroad", "global"];
const DOMAINS = ["ai", "software", "data", "hardware", "quant", "security", "design", "other"];
const pick = (xs: unknown, allowed: string[]) => (Array.isArray(xs) ? [...new Set(xs.filter((x): x is string => typeof x === "string" && allowed.includes(x)))] : []);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, "").trim().slice(0, max) : "");
/** `loc` is "City|Alias|…" — at most 80 terms of 60 chars (a country briefing sends ~60 cities). */
const locTerms = (v: unknown) =>
  str(v, 3000)
    .split("|")
    .map((x) => x.trim().slice(0, 60))
    .filter(Boolean)
    .slice(0, 80)
    .join("|");

/** Validate a filter object that came from the client (server actions) — never trust its shape. */
export function sanitizeFilters(f: unknown): Partial<JobFilters> {
  const o = (f && typeof f === "object" ? f : {}) as Record<string, unknown>;
  return {
    q: str(o.q, 80),
    loc: locTerms(o.loc),
    level: pick(o.level, LEVELS),
    region: pick(o.region, REGIONS),
    domain: pick(o.domain, DOMAINS),
    group: str(o.group, 60),
    company: str(o.company, 120),
    within: (["1h", "24h", "7d", "30d"].includes(o.within as string) ? o.within : "") as JobFilters["within"],
    tech: o.tech !== false,
    sort: o.sort === "match" ? "match" : "new",
  };
}

export function parseFilters(sp: RawParams, defaults: Partial<JobFilters> = {}): JobFilters {
  const has = (k: string) => sp[k] !== undefined;
  return {
    q: str(one(sp.q), 80),
    loc: locTerms((Array.isArray(sp.loc) ? sp.loc[0] : sp.loc) ?? ""),
    level: has("level") ? pick(list(sp.level), LEVELS) : (defaults.level ?? []),
    region: has("region") ? pick(list(sp.region), REGIONS) : (defaults.region ?? []),
    domain: pick(list(sp.domain), DOMAINS),
    group: str(one(sp.group), 60),
    company: str(one(sp.company), 120),
    within: (["1h", "24h", "7d", "30d"].includes(one(sp.within)) ? one(sp.within) : (defaults.within ?? "")) as JobFilters["within"],
    tech: has("tech") ? one(sp.tech) !== "0" : (defaults.tech ?? true),
    sort: (one(sp.sort) === "match" ? "match" : one(sp.sort) === "new" ? "new" : (defaults.sort ?? "new")) as Sort,
    page: Math.min(200, Math.max(1, Math.floor(Number(one(sp.page))) || 1)),
    view: (one(sp.view) === "cards" ? "cards" : one(sp.view) === "list" ? "list" : (defaults.view ?? "list")) as "list" | "cards",
    job: /^[\w.:\-]{1,200}$/.test(one(sp.job)) ? one(sp.job) : "",
  };
}

/** Only non-default values go in the URL. */
export function toSearch(f: Partial<JobFilters>): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.loc) p.set("loc", f.loc);
  if (f.level?.length) p.set("level", f.level.join(","));
  if (f.region?.length) p.set("region", f.region.join(","));
  if (f.domain?.length) p.set("domain", f.domain.join(","));
  if (f.group) p.set("group", f.group);
  if (f.company) p.set("company", f.company);
  if (f.within) p.set("within", f.within);
  if (f.tech === false) p.set("tech", "0");
  if (f.sort) p.set("sort", f.sort);
  if (f.view) p.set("view", f.view);
  if (f.job) p.set("job", f.job);
  const s = p.toString();
  return s ? `?${s}` : "";
}

export const WITHIN_MS: Record<Within, number> = { "1h": 3_600_000, "24h": 86_400_000, "7d": 7 * 86_400_000, "30d": 30 * 86_400_000 };

export const LEVEL_OPTIONS = [
  { value: "intern", label: "Intern" },
  { value: "newgrad", label: "New grad" },
  { value: "research", label: "Research" },
  { value: "experienced", label: "Experienced" },
];
export const REGION_OPTIONS = [
  { value: "india", label: "India" },
  { value: "remote", label: "Remote" },
  { value: "abroad", label: "Abroad" },
];
export const DOMAIN_OPTIONS = [
  { value: "ai", label: "AI/ML" },
  { value: "software", label: "Software" },
  { value: "data", label: "Data" },
  { value: "hardware", label: "Hardware" },
  { value: "quant", label: "Quant" },
  { value: "security", label: "Security" },
  { value: "design", label: "Design" },
];
export const WITHIN_OPTIONS = [
  { value: "1h", label: "Last hour" },
  { value: "24h", label: "Today" },
  { value: "7d", label: "This week" },
  { value: "30d", label: "This month" },
];
export const GROUP_OPTIONS = [
  "Big Tech",
  "AI Labs",
  "Fintech & Banks",
  "Quant/HFT",
  "Indian Startups",
  "SaaS & Enterprise",
  "Semiconductors & Hardware",
  "Consulting & IT Services",
].map((g) => ({ value: g, label: g }));

/** Hero search pill: role → filters */
export const ROLE_OPTIONS = [
  { value: "ai-intern", label: "AI/ML Intern" },
  { value: "swe-intern", label: "Software Intern" },
  { value: "newgrad", label: "New grad roles" },
  { value: "data", label: "Data Science" },
  { value: "hardware", label: "Hardware / Embedded" },
  { value: "research", label: "Research" },
  { value: "quant", label: "Quant" },
  { value: "any", label: "Any tech role" },
];
export const ROLE_FILTERS: Record<string, Partial<JobFilters>> = {
  "ai-intern": { domain: ["ai"], level: ["intern", "research"] },
  "swe-intern": { domain: ["software"], level: ["intern"] },
  newgrad: { level: ["newgrad"] },
  data: { domain: ["data"], level: ["intern", "newgrad"] },
  hardware: { domain: ["hardware"], level: ["intern", "newgrad"] },
  research: { level: ["research"] },
  quant: { domain: ["quant"], level: ["intern", "newgrad"] },
  any: {},
};
export const LOCATION_OPTIONS = [
  { value: "india", label: "India" },
  { value: "remote", label: "Remote" },
  { value: "world", label: "Worldwide" },
  { value: "Pune", label: "Pune" },
  { value: "Bengaluru|Bangalore", label: "Bengaluru" },
  { value: "Hyderabad", label: "Hyderabad" },
  { value: "Mumbai", label: "Mumbai" },
  { value: "Gurugram|Gurgaon|Delhi|Noida", label: "Delhi NCR" },
];
export function locationFilter(v: string): Partial<JobFilters> {
  if (v === "india" || v === "remote") return { region: [v] };
  if (v === "world") return {};
  return { loc: v };
}
