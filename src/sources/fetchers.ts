import { fetchJson } from "../lib/http";
import * as P from "./parsers";
import type { FetchContext, FetchOutcome, RawJob, SourceConfig } from "./types";

/** Queries used for search-based ATSs (Workday, Eightfold, Oracle, Amazon). */
export const SEARCH_QUERIES = ["intern", "graduate", "software engineer", "machine learning", "data scientist", "research"];
/** Run again restricted to India (Workday facet / Eightfold location / Amazon country). */
export const INDIA_QUERIES = ["intern", "graduate", "software engineer", "machine learning"];

/**
 * Find the tenant's "India" location facet (its id and parameter name differ per tenant:
 * locationMainGroup, locationCountry, Location_Country…). Cached for a week.
 */
async function workdayIndiaFacet(url: string, ctx: FetchContext): Promise<Record<string, string[]> | null> {
  const cached = await ctx.cacheGet?.<{ at: number; facets: Record<string, string[]> | null }>("wd-india");
  if (cached && Date.now() - cached.at < 7 * 86_400_000) return cached.facets;
  let facets: Record<string, string[]> | null = null;
  try {
    const { data } = await fetchJson<any>(url, { method: "POST", body: { appliedFacets: {}, limit: 1, offset: 0, searchText: "" }, retries: 1 });
    outer: for (const f of data?.facets ?? []) {
      const flat = (f.values ?? []).flatMap((v: any) => (v.values ? v.values.map((x: any) => ({ ...x, param: v.facetParameter ?? f.facetParameter })) : [{ ...v, param: f.facetParameter }]));
      for (const v of flat) {
        if (/^india$/i.test(String(v.descriptor ?? "").trim()) && v.id) {
          facets = { [v.param ?? f.facetParameter]: [v.id] };
          break outer;
        }
      }
    }
  } catch {
    /* no facet → global queries only */
  }
  await ctx.cacheSet?.("wd-india", { at: Date.now(), facets });
  return facets;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const uniq = (jobs: RawJob[]) => {
  const seen = new Set<string>();
  return jobs.filter((j) => (seen.has(j.externalId) ? false : (seen.add(j.externalId), true)));
};

/**
 * Run each query; individual query failures are tolerated as long as at least
 * one succeeds (so one flaky search doesn't fail the whole company).
 */
async function multiQuery(
  queries: string[],
  run: (q: string) => Promise<RawJob[]>,
  opts: { sequentialDelayMs?: number } = {},
): Promise<RawJob[]> {
  let results: PromiseSettledResult<RawJob[]>[];
  if (opts.sequentialDelayMs != null) {
    results = [];
    for (const q of queries) {
      results.push(await run(q).then((value) => ({ status: "fulfilled" as const, value }), (reason) => ({ status: "rejected" as const, reason })));
      await sleep(opts.sequentialDelayMs);
    }
  } else {
    results = await Promise.allSettled(queries.map(run));
  }
  const ok = results.filter((r): r is PromiseFulfilledResult<RawJob[]> => r.status === "fulfilled");
  if (!ok.length) throw (results[0] as PromiseRejectedResult).reason;
  return uniq(ok.flatMap((r) => r.value));
}

/** Eightfold rate-limits bursts (HTTP 429), so its requests go one at a time. */
const EIGHTFOLD_DELAY_MS = 1200;

export async function fetchSource(cfg: SourceConfig, ctx: FetchContext): Promise<FetchOutcome> {
  const { company, now } = ctx;
  switch (cfg.ats) {
    case "greenhouse": {
      const { data } = await fetchJson(`https://boards-api.greenhouse.io/v1/boards/${cfg.slug}/jobs?content=true`);
      return { jobs: P.parseGreenhouse(data, company) };
    }
    case "lever": {
      const { data } = await fetchJson(`https://api.lever.co/v0/postings/${cfg.slug}?mode=json`);
      return { jobs: P.parseLever(data, company) };
    }
    case "ashby": {
      const { data } = await fetchJson(`https://api.ashbyhq.com/posting-api/job-board/${cfg.slug}`);
      return { jobs: P.parseAshby(data, company) };
    }
    case "smartrecruiters": {
      const jobs: RawJob[] = [];
      const maxPages = cfg.maxPages ?? 10;
      for (let page = 0; page < maxPages; page++) {
        const { data } = await fetchJson<any>(
          `https://api.smartrecruiters.com/v1/companies/${cfg.slug}/postings?limit=100&offset=${page * 100}`,
        );
        jobs.push(...P.parseSmartRecruiters(data, company, cfg.slug));
        if ((page + 1) * 100 >= (data?.totalFound ?? 0)) break;
      }
      return { jobs: uniq(jobs) };
    }
    case "workday": {
      const url = `https://${cfg.host}/wday/cxs/${cfg.tenant}/${cfg.site}/jobs`;
      const india = await workdayIndiaFacet(url, ctx);
      // global queries + the same early-career queries restricted to India, so Indian
      // roles aren't crowded out of the relevance-ranked top 40
      const queries = [...SEARCH_QUERIES.map((q) => ({ q, facets: {} })), ...(india ? INDIA_QUERIES.map((q) => ({ q, facets: india })) : [])];
      const jobs = await multiQuery(queries.map((x) => JSON.stringify(x)), async (key) => {
        const { q, facets } = JSON.parse(key) as { q: string; facets: Record<string, string[]> };
        const out: RawJob[] = [];
        for (const offset of [0, 20]) {
          const { data } = await fetchJson<any>(url, {
            method: "POST",
            body: { appliedFacets: facets, limit: 20, offset, searchText: q },
          });
          out.push(...P.parseWorkday(data, company, cfg.host, cfg.site, now));
          if ((data?.total ?? 0) <= offset + 20) break;
        }
        return out;
      });
      return { jobs };
    }
    case "eightfold": {
      const efQueries = [...SEARCH_QUERIES.slice(0, 4).map((q) => `${q}|`), ...INDIA_QUERIES.slice(0, 2).map((q) => `${q}|India`)];
      const jobs = await multiQuery(efQueries, async (key) => {
        const [q, location] = key.split("|");
        const qs = `domain=${cfg.domain}&query=${encodeURIComponent(q)}&location=${encodeURIComponent(location)}&start=0&sort_by=timestamp`;
        try {
          const { data } = await fetchJson(`https://${cfg.host}/api/apply/v2/jobs?${qs}&num=50`, {
            noRetryOn: [403],
            retries: 1,
          });
          return P.parseEightfold(data, company, cfg.host);
        } catch {
          // newer Eightfold tenants only expose the PCSX API (10 per page)
          const out: RawJob[] = [];
          for (const start of [0, 10, 20]) {
            const { data } = await fetchJson<any>(
              `https://${cfg.host}/api/pcsx/search?domain=${cfg.domain}&query=${encodeURIComponent(q)}&location=${encodeURIComponent(location)}&start=${start}&sort_by=timestamp`,
            );
            const page = P.parseEightfold(data, company, cfg.host);
            out.push(...page);
            if (page.length < 10) break;
            await sleep(EIGHTFOLD_DELAY_MS);
          }
          return out;
        }
      }, { sequentialDelayMs: EIGHTFOLD_DELAY_MS });
      return { jobs };
    }
    case "oracle": {
      const jobs = await multiQuery(SEARCH_QUERIES, async (q) => {
        const finder = `findReqs;siteNumber=${cfg.site},limit=50,sortBy=POSTING_DATES_DESC,keyword=${q}`;
        const { data } = await fetchJson(
          `https://${cfg.host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList&finder=${encodeURIComponent(finder)}`,
        );
        return P.parseOracle(data, company, cfg.host, cfg.site);
      });
      return { jobs };
    }
    case "amazon": {
      const amzQueries = [
        ...["intern", "university graduate", "machine learning", "software development engineer", "data scientist"].map((q) => `${q}|`),
        ...["intern", "university", "software development engineer", "machine learning"].map((q) => `${q}|IND`),
      ];
      const jobs = await multiQuery(amzQueries, async (key) => {
        const [q, country] = key.split("|");
        const { data } = await fetchJson(
          `https://www.amazon.jobs/en/search.json?base_query=${encodeURIComponent(q)}${country ? `&country=${country}` : ""}&offset=0&result_limit=100&sort=recent`,
        );
        return P.parseAmazon(data);
      });
      return { jobs };
    }
    case "unstop": {
      const jobs: RawJob[] = [];
      for (let page = 1; page <= 15; page++) {
        const { data } = await fetchJson<any>(
          `https://unstop.com/api/public/opportunity/search-result?opportunity=${cfg.kind}&per_page=100&oppstatus=open&page=${page}`,
          { timeoutMs: 30_000 },
        );
        jobs.push(...P.parseUnstop(data));
        if (page >= (data?.data?.last_page ?? 1)) break;
        await sleep(700); // polite: sequential pages
      }
      return { jobs: uniq(jobs) };
    }
    case "simplify": {
      const url = `https://raw.githubusercontent.com/${cfg.repo}/${cfg.branch ?? "dev"}/.github/scripts/listings.json`;
      const etag = await ctx.getEtag?.();
      const res = await fetchJson(url, { headers: etag ? { "If-None-Match": etag } : {}, timeoutMs: 45_000 });
      if (res.status === 304) return { unchanged: true };
      const newTag = res.headers.get("etag");
      if (newTag) await ctx.setEtag?.(newTag);
      return { jobs: P.parseSimplify(res.data, now) };
    }
  }
}

/** Sources whose list API has no description; we fetch details for new postings only. */
export const ENRICHABLE = new Set(["workday", "smartrecruiters"]);

export async function fetchDetail(cfg: SourceConfig, job: { externalId: string; url: string }): Promise<P.JobDetail | null> {
  if (cfg.ats === "workday") {
    const pathname = new URL(job.url).pathname;
    const prefix = `/${cfg.site}`;
    if (!pathname.startsWith(prefix + "/")) return null;
    const path = pathname.slice(prefix.length);
    const { data } = await fetchJson(`https://${cfg.host}/wday/cxs/${cfg.tenant}/${cfg.site}${path}`, { retries: 1 });
    return P.parseWorkdayDetail(data);
  }
  if (cfg.ats === "smartrecruiters") {
    const { data } = await fetchJson(`https://api.smartrecruiters.com/v1/companies/${cfg.slug}/postings/${job.externalId}`, { retries: 1 });
    return P.parseSmartRecruitersDetail(data);
  }
  return null;
}
