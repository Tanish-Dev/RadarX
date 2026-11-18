/**
 * News: RSS 2.0 / RSS 1.0 (RDF) / Atom parsing, headline → place, topics and story clustering.
 * Pure functions (tested in tests/news.test.ts).
 */
import { createHash } from "node:crypto";
import { CITIES } from "../data/cities";
import { COMPANY_HQ, PLACES, isIndiaPlace, type NewsKind } from "../data/news";
import { decodeEntities, htmlToText } from "./text";

export interface FeedItem {
  title: string;
  url: string;
  summary: string;
  image: string | null;
  publishedAt: number | null;
  categories: string[];
  /** Hacker News points (hnrss puts them in the description) */
  points: number | null;
}

const cdata = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? cdata(m[1]).trim() : null;
}

function attr(block: string, name: string, a: string, where?: RegExp): string | null {
  const re = new RegExp(`<${name}\\b([^>]*?)/?>`, "gi");
  for (const m of block.matchAll(re)) {
    if (where && !where.test(m[1])) continue;
    const v = m[1].match(new RegExp(`\\b${a}\\s*=\\s*["']([^"']+)["']`, "i"));
    if (v) return decodeEntities(v[1]);
  }
  return null;
}

const clean = (s: string | null) => (s ? htmlToText(decodeEntities(cdata(s))).replace(/\s+/g, " ").trim() : "");

function parseDate(s: string | null): number | null {
  if (!s) return null;
  const t = Date.parse(s.trim());
  return Number.isFinite(t) ? t : null;
}

/** Parse an RSS/RDF/Atom document. Throws if it isn't one (HTML error page, JSON, empty). */
export function parseFeed(xml: string): FeedItem[] {
  if (!/<(rss|feed|rdf:RDF)[\s>]/i.test(xml)) throw new Error("not an RSS/Atom feed");
  const atom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const blocks = [...xml.matchAll(atom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi)].map((m) => m[0]);
  const out: FeedItem[] = [];
  for (const b of blocks) {
    const title = clean(tag(b, "title"));
    const url = atom
      ? attr(b, "link", "href", /rel\s*=\s*["']alternate["']/i) ?? attr(b, "link", "href")
      : (tag(b, "link") && decodeEntities(tag(b, "link")!)) || (/isPermaLink="true"/.test(b) ? tag(b, "guid") : null);
    if (!title || !url || !/^https?:\/\//.test(url)) continue;
    const rawDesc = tag(b, atom ? "summary" : "description") ?? tag(b, "content") ?? tag(b, "content:encoded") ?? "";
    const descText = clean(rawDesc);
    const points = descText.match(/Points:\s*(\d+)/);
    const image =
      attr(b, "media:thumbnail", "url") ??
      attr(b, "media:content", "url", /medium\s*=\s*["']image|type\s*=\s*["']image|url\s*=\s*["'][^"']+\.(jpe?g|png|webp)/i) ??
      attr(b, "enclosure", "url", /type\s*=\s*["']image/i) ??
      (decodeEntities(cdata(rawDesc)).match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] ?? null);
    const categories = [
      ...[...b.matchAll(/<category[^>]*>([\s\S]*?)<\/category>/gi)].map((m) => clean(m[1])),
      ...[...b.matchAll(/<category[^>]*\bterm=["']([^"']+)["']/gi)].map((m) => decodeEntities(m[1])),
      ...[...b.matchAll(/<dc:subject>([\s\S]*?)<\/dc:subject>/gi)].map((m) => clean(m[1])),
    ].filter(Boolean);
    out.push({
      title,
      url: url.trim(),
      // hnrss descriptions are just "Article URL / Comments URL / Points" — not a summary
      summary: points ? "" : descText.slice(0, 600),
      image: image && /^https?:\/\//.test(image) ? image : null,
      publishedAt: parseDate(tag(b, "pubDate") ?? tag(b, "published") ?? tag(b, "updated") ?? tag(b, "dc:date")),
      categories: [...new Set(categories)].slice(0, 8),
      points: points ? Number(points[1]) : null,
    });
  }
  if (blocks.length && !out.length) throw new Error("feed items had no title/link — unexpected shape");
  return out;
}

export const newsId = (url: string) => createHash("sha1").update(url.replace(/[?#].*$/, "").replace(/\/$/, "")).digest("hex").slice(0, 16);

// ── place ────────────────────────────────────────────────────────────────────
export interface Located {
  place: string;
  lat: number;
  lon: number;
  india: boolean;
  /** "place" = named in the story; "hq" = the tech company's headquarters */
  via: "place" | "hq";
}

type Entry = { term: string; place: string; lat: number; lon: number };
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function regexFor(entries: Entry[]) {
  if (!entries.length) return null;
  const sorted = [...entries].sort((a, b) => b.term.length - a.term.length);
  // whole words; "U.S." ends in a dot, so the edges are "not a letter/digit" rather than \b
  return new RegExp(`(?<![\\p{L}\\p{N}])(${sorted.map((e) => esc(e.term)).join("|")})(?![\\p{L}\\p{N}])`, "u");
}
/** First place term in the text; weak terms ("~Putin") only when no strong one appears. */
function buildMatcher(rows: [string, number, number, ...string[]][]) {
  const strong: Entry[] = [], weak: Entry[] = [];
  for (const [place, lat, lon, ...terms] of rows)
    for (const t of terms) (t.startsWith("~") ? weak : strong).push({ term: t.replace(/^~/, ""), place, lat, lon });
  const byTerm = new Map([...weak, ...strong].map((e) => [e.term, e]));
  const res = [regexFor(strong), regexFor(weak)].filter((r): r is RegExp => !!r);
  return (text: string): Entry | null => {
    for (const re of res) {
      const m = re.exec(text);
      if (m) return byTerm.get(m[1])!;
    }
    return null;
  };
}
const matchPlace = buildMatcher(PLACES);
const matchHq = buildMatcher(COMPANY_HQ);
// tech-hub cities from the job geocoder ("drone delivery in Houston"); names that are also people/brands are skipped
const NOT_PLACES = new Set(["Washington", "Hawthorne", "Columbus", "Boulder", "Sofia", "Phoenix", "Cambridge", "Oxford", "Manipal", "Bastrop", "Fremont", "Irvine", "Austin", "Santiago", "Lima", "Perth", "Waterloo", "Stamford", "Goa", "Dallas"]);
const INDIA_CITIES = new Set(CITIES.slice(0, CITIES.findIndex((c) => c[0] === "San Francisco")).map((c) => c[0])); // the list starts with India
const matchCity = buildMatcher(CITIES.filter((c) => !NOT_PLACES.has(c[0])).map(([name, lat, lon]) => [name, lat, lon, name] as [string, number, number, string]));

/** Place named in the title, else a tech company's HQ in the title, else the same in the summary. */
export function locate(title: string, summary: string, kind: NewsKind): Located | null {
  const lead = summary.slice(0, 400);
  type Try = [string, typeof matchPlace, Located["via"]];
  const tech = kind === "tech";
  const tries: Try[] = [[title, matchPlace, "place"], [title, matchCity, "place"]];
  if (tech) tries.push([title, matchHq, "hq"]);
  tries.push([lead, matchPlace, "place"], [lead, matchCity, "place"]);
  if (tech) tries.push([lead, matchHq, "hq"]);
  for (const [text, fn, via] of tries) {
    const e = fn(text);
    if (e) return { place: e.place, lat: e.lat, lon: e.lon, india: isIndiaPlace(e.place) || INDIA_CITIES.has(e.place), via };
  }
  return null;
}

// ── topics ───────────────────────────────────────────────────────────────────
export const TOPICS: Record<NewsKind, { id: string; label: string; re: RegExp }[]> = {
  tech: [
    { id: "ai", label: "AI", re: /\b(AI|A\.I\.|artificial intelligence|LLMs?|GPT-?\d*|chatbots?|OpenAI|Anthropic|Gemini|Claude|machine learning|deep learning|agentic|AI agents?|DeepSeek|Copilot|Llama|Mistral|generative)\b/ },
    { id: "chips", label: "Chips", re: /\b(chips?|chipmakers?|semiconductors?|GPUs?|TSMC|Nvidia|NVIDIA|fabs?|wafers?|ASML|Qualcomm|Intel|AMD|foundry)\b/i },
    { id: "funding", label: "Funding & deals", re: /\b(raises?|raised|funding|Series [A-F]|seed round|valuation|unicorn|IPOs?|acquires?|acquisition|acquired|merger|buyout|invests?|investment)\b/i },
    { id: "layoffs", label: "Layoffs", re: /\b(layoffs?|lays? off|laid off|job cuts?|cuts? [\d,]+ (jobs|roles|staff)|downsiz\w*|restructuring)\b/i },
    { id: "hiring", label: "Hiring & careers", re: /\b(hiring|hires|recruit\w*|internships?|interns|freshers|campus|placements?|H-1B|visas?|graduates|talent|salar(y|ies)|jobs)\b/i },
    { id: "security", label: "Security", re: /\b(hack\w*|breach\w*|ransomware|vulnerabilit\w+|cyber\w*|malware|exploit\w*|zero-day|phishing|spyware|leak\w*)\b/i },
    { id: "policy", label: "Policy & law", re: /\b(regulat\w+|antitrust|lawsuits?|sues?|sued|bans?|banned|bill|law|court|FTC|DoJ|EU|DPDP|MeitY|policy|sanctions?|export controls?|curbs?|tariffs?|probe)\b/ },
    { id: "space", label: "Space", re: /\b(space|rockets?|satellites?|ISRO|NASA|SpaceX|Starship|lunar|Moon|Mars|orbit\w*|Gaganyaan)\b/i },
    { id: "startups", label: "Startups", re: /\b(startups?|founders?|YC|Y Combinator|accelerator)\b/i },
  ],
  world: [
    { id: "conflict", label: "Conflict", re: /\b(war|wars|strikes?|attacks?|missiles?|troops|ceasefire|truce|military|killed|drones?|shelling|invasion|militants?|bomb\w*|hostages?|army|clashes)\b/i },
    { id: "politics", label: "Politics", re: /\b(elections?|vote[sd]?|voting|polls?|president|prime minister|PM|parliament|government|minister|opposition|coalition|senate|cabinet|party|protests?|coup)\b/i },
    { id: "economy", label: "Economy & trade", re: /\b(econom\w+|inflation|GDP|trade|tariffs?|markets?|stocks?|recession|budget|interest rates?|central bank|RBI|Fed|rupee|dollar|oil prices?|exports?|imports?)\b/i },
    { id: "climate", label: "Climate & disasters", re: /\b(climate|COP\d+|floods?|flooding|wildfires?|heatwaves?|cyclones?|earthquakes?|storms?|hurricanes?|typhoons?|emissions|drought|monsoon|landslides?)\b/i },
    { id: "diplomacy", label: "Diplomacy", re: /\b(summit|talks|treaty|deal|sanctions|UN|G7|G20|BRICS|NATO|bilateral|envoy|ambassador|diplomat\w*|peace)\b/ },
    { id: "health", label: "Health", re: /\b(health|virus|outbreak|WHO|vaccines?|disease|pandemic|hospitals?|cholera|measles|mpox)\b/i },
  ],
};

export function topicsFor(kind: NewsKind, title: string, summary: string, categories: string[] = []): string[] {
  const text = `${title} ${summary.slice(0, 300)} ${categories.join(" ")}`;
  return TOPICS[kind].filter((t) => t.re.test(text)).map((t) => t.id).slice(0, 3);
}

export const topicLabel = (id: string) => [...TOPICS.tech, ...TOPICS.world].find((t) => t.id === id)?.label ?? id;

// ── clustering: the same story from several outlets ──────────────────────────
const STOP = new Set(
  "the a an and or of to in on for with at by from as is are was were be been it its this that after over into amid says said say new news live latest update updates more than about how why what who will would could can may first two three year years week day days off out up down vs us but not has have had his her their they we you he she them our".split(" "),
);

export function titleTokens(title: string): Set<string> {
  const toks = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]s\b/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w))
    .map((w) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
  return new Set(toks);
}

export interface ClusterInput {
  id: string;
  source: string;
  kind: NewsKind;
  title: string;
  ts: number;
}

/**
 * Union-find over headlines published within 36 h of each other by *different* outlets that share
 * enough distinctive words. Returns id → cluster id (the earliest member).
 */
export function clusterNews(items: ClusterInput[]): Map<string, string> {
  const sorted = [...items].sort((a, b) => a.ts - b.ts);
  const toks = sorted.map((i) => titleTokens(i.title));
  const parent = sorted.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (sorted[j].ts - sorted[i].ts > 36 * 3_600_000) break;
      if (sorted[i].source === sorted[j].source || sorted[i].kind !== sorted[j].kind) continue;
      const a = toks[i], b = toks[j];
      let shared = 0;
      for (const t of a) if (b.has(t)) shared++;
      if (shared < 2) continue;
      const jac = shared / (a.size + b.size - shared);
      if ((shared >= 3 && jac >= 0.2) || jac >= 0.4) {
        const ri = find(i), rj = find(j);
        if (ri !== rj) parent[Math.max(ri, rj)] = Math.min(ri, rj); // root = earliest
      }
    }
  }
  return new Map(sorted.map((it, i) => [it.id, sorted[find(i)].id]));
}

/** Rank for "main stories": coverage dominates, HN points help tech, age decays. */
export function storyScore(coverage: number, points: number | null, ageHours: number): number {
  return (coverage - 1) * 3 + Math.log10((points ?? 0) + 1) * 1.5 - ageHours / 6; // fresh beats stale: a day-old story must carry ~4 more outlets to outrank a new one
}
