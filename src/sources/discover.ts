import { fetchJson, HttpError } from "../lib/http";
import { slugCandidates } from "../lib/text";
import type { SourceConfig } from "./types";

type ProbeAts = "greenhouse" | "lever" | "ashby" | "smartrecruiters";
type Probe = { ats: ProbeAts; url: (s: string) => string; count: (d: any, name: string) => number };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const PROBES: Probe[] = [
  { ats: "greenhouse", url: (s) => `https://boards-api.greenhouse.io/v1/boards/${s}/jobs`, count: (d) => d?.jobs?.length ?? 0 },
  { ats: "lever", url: (s) => `https://api.lever.co/v0/postings/${s}?mode=json`, count: (d) => (Array.isArray(d) ? d.length : 0) },
  { ats: "ashby", url: (s) => `https://api.ashbyhq.com/posting-api/job-board/${s}`, count: (d) => d?.jobs?.length ?? 0 },
  {
    // SmartRecruiters answers 200 + empty list for any slug, and short slugs can belong to an
    // unrelated company — so also require the company name on the postings to match.
    ats: "smartrecruiters",
    url: (s) => `https://api.smartrecruiters.com/v1/companies/${s}/postings?limit=5`,
    count: (d, name) => {
      const co = d?.content?.[0]?.company?.name;
      if (!co) return 0;
      const a = norm(co), b = norm(name).replace(/(ai|inc|group|technologies)$/, "");
      return a.includes(b) || b.includes(a) ? (d.totalFound ?? 0) : 0;
    },
  },
];

export interface DiscoveryResult {
  config: SourceConfig | null;
  /** postings on the chosen board */
  count: number;
  /** every board that answered, e.g. "greenhouse:ramp=1" */
  candidates: string[];
}

/**
 * Probe Greenhouse, Lever, Ashby and SmartRecruiters with every candidate slug and pick
 * the board with the most postings. Empty boards don't count: a stale, abandoned
 * board is a common false positive (e.g. an old Greenhouse board after a move to Ashby).
 */
export async function discoverAts(name: string, extraSlugs: string[] = []): Promise<DiscoveryResult> {
  const slugs = [...new Set([...extraSlugs, ...slugCandidates(name)])];
  const hits: { ats: ProbeAts; slug: string; count: number }[] = [];
  await Promise.all(
    PROBES.map(async (probe) => {
      for (const raw of slugs) {
        const slug = probe.ats === "smartrecruiters" ? raw : raw.toLowerCase();
        try {
          const { data } = await fetchJson(probe.url(slug), { retries: 1, timeoutMs: 20_000 });
          const n = probe.count(data, name);
          if (n > 0) {
            hits.push({ ats: probe.ats, slug, count: n });
            return; // first good slug per ATS is enough
          }
        } catch (e) {
          if (!(e instanceof HttpError)) continue; // network blip → next slug
        }
      }
    }),
  );
  hits.sort((a, b) => b.count - a.count);
  const best = hits[0];
  return {
    config: best ? { ats: best.ats, slug: best.slug } : null,
    count: best?.count ?? 0,
    candidates: hits.map((h) => `${h.ats}:${h.slug}=${h.count}`),
  };
}

/** Recognise a pasted careers URL and turn it into a config without probing. */
export function configFromUrl(raw: string): SourceConfig | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const seg = u.pathname.split("/").filter(Boolean);
  if (/(^|\.)greenhouse\.io$/.test(host)) {
    const slug = host.startsWith("boards-api") ? seg[2] : seg[0] === "embed" ? u.searchParams.get("for") : seg[0];
    return slug ? { ats: "greenhouse", slug } : null;
  }
  if (host === "jobs.lever.co" || host === "api.lever.co") {
    const slug = host === "api.lever.co" ? seg[2] : seg[0];
    return slug ? { ats: "lever", slug } : null;
  }
  if (host === "jobs.ashbyhq.com") return seg[0] ? { ats: "ashby", slug: seg[0] } : null;
  if (host.endsWith("smartrecruiters.com")) return seg[0] ? { ats: "smartrecruiters", slug: seg[0] } : null;
  const wd = host.match(/^([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com$/);
  if (wd) {
    const site = seg[0] === "wday" ? seg[3] : seg.find((s) => !/^[a-z]{2}-[A-Z]{2}$/.test(s));
    return site ? { ats: "workday", host, tenant: wd[1], site } : null;
  }
  if (host.endsWith("oraclecloud.com")) {
    const i = seg.indexOf("sites");
    return i >= 0 && seg[i + 1] ? { ats: "oracle", host, site: seg[i + 1] } : null;
  }
  if (host.endsWith("amazon.jobs")) return { ats: "amazon" };
  return null;
}
