/**
 * World Monitor+ sources (probed 2026-11-19). All keyless public endpoints.
 * Statuspage-hosted status sites disallow `/api/` in robots.txt, so RadarX reads their public `history.atom` instead.
 * GDACS was skipped: its robots.txt only allows visits 04:00–06:45 UTC at 1 request/min.
 */
export interface StatusPage {
  id: string;
  name: string;
  /** human page */
  url: string;
  kind: "statuspage" | "gcp" | "aws";
  /** feed / JSON endpoint */
  feed: string;
  group: "cloud" | "ai" | "dev";
}

export const STATUS_PAGES: StatusPage[] = [
  { id: "aws", name: "AWS", url: "https://health.aws.amazon.com/health/status", kind: "aws", feed: "https://status.aws.amazon.com/rss/all.rss", group: "cloud" },
  { id: "gcp", name: "Google Cloud", url: "https://status.cloud.google.com", kind: "gcp", feed: "https://status.cloud.google.com/incidents.json", group: "cloud" },
  { id: "cloudflare", name: "Cloudflare", url: "https://www.cloudflarestatus.com", kind: "statuspage", feed: "https://www.cloudflarestatus.com/history.atom", group: "cloud" },
  { id: "vercel", name: "Vercel", url: "https://www.vercel-status.com", kind: "statuspage", feed: "https://www.vercel-status.com/history.atom", group: "cloud" },
  { id: "netlify", name: "Netlify", url: "https://www.netlifystatus.com", kind: "statuspage", feed: "https://www.netlifystatus.com/history.atom", group: "cloud" },
  { id: "supabase", name: "Supabase", url: "https://status.supabase.com", kind: "statuspage", feed: "https://status.supabase.com/history.atom", group: "cloud" },
  { id: "openai", name: "OpenAI", url: "https://status.openai.com", kind: "statuspage", feed: "https://status.openai.com/history.atom", group: "ai" },
  { id: "claude", name: "Claude", url: "https://status.claude.com", kind: "statuspage", feed: "https://status.claude.com/history.atom", group: "ai" },
  { id: "github", name: "GitHub", url: "https://www.githubstatus.com", kind: "statuspage", feed: "https://www.githubstatus.com/history.atom", group: "dev" },
  { id: "npm", name: "npm", url: "https://status.npmjs.org", kind: "statuspage", feed: "https://status.npmjs.org/history.atom", group: "dev" },
  { id: "atlassian", name: "Atlassian", url: "https://status.atlassian.com", kind: "statuspage", feed: "https://status.atlassian.com/history.atom", group: "dev" },
  { id: "discord", name: "Discord", url: "https://discordstatus.com", kind: "statuspage", feed: "https://discordstatus.com/history.atom", group: "dev" },
];

/** Polymarket (gamma API, no robots.txt, no key) tag lanes shown on /world. */
export const MARKET_LANES = [
  { tag: "ai", label: "AI" },
  { tag: "tech", label: "Tech" },
  { tag: "geopolitics", label: "Geopolitics" },
  { tag: "economy", label: "Economy" },
] as const;
export type MarketLane = (typeof MARKET_LANES)[number]["tag"];

/** Submarine cables — TeleGeography's public map data (CC BY-NC-SA; personal non-commercial use, attribution shown). */
export const CABLES_URL = "https://www.submarinecablemap.com/api/v3/cable/cable-geo.json";
