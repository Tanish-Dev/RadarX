/**
 * Probe every source type against a real endpoint, print the response shape,
 * and (with --save) write a trimmed sample into tests/fixtures/.
 *   npm run probe            # just report
 *   npm run probe -- --save  # report + refresh fixtures
 */
import { writeFileSync } from "node:fs";
import { fetchJson } from "../src/lib/http";

const SAVE = process.argv.includes("--save");

interface Probe {
  name: string;
  url: string;
  method?: "GET" | "POST";
  body?: unknown;
  /** Return the array of items inside the response. */
  items: (d: any) => any[] | undefined;
  /** Rebuild a trimmed response with only N items for the fixture. */
  trim?: (d: any, items: any[]) => any;
}

const probes: Probe[] = [
  {
    name: "greenhouse",
    url: "https://boards-api.greenhouse.io/v1/boards/stripe/jobs?content=true",
    items: (d) => d.jobs,
    trim: (d, it) => ({ ...d, jobs: it }),
  },
  {
    name: "lever",
    url: "https://api.lever.co/v0/postings/palantir?mode=json",
    items: (d) => d,
    trim: (_d, it) => it,
  },
  {
    name: "ashby",
    url: "https://api.ashbyhq.com/posting-api/job-board/openai",
    items: (d) => d.jobs,
    trim: (d, it) => ({ ...d, jobs: it }),
  },
  {
    name: "smartrecruiters",
    url: "https://api.smartrecruiters.com/v1/companies/BoschGroup/postings?limit=100&offset=0",
    items: (d) => d.content,
    trim: (d, it) => ({ ...d, content: it }),
  },
  {
    name: "workday",
    url: "https://nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/NVIDIAExternalCareerSite/jobs",
    method: "POST",
    body: { appliedFacets: {}, limit: 20, offset: 0, searchText: "intern" },
    items: (d) => d.jobPostings,
    trim: (d, it) => ({ ...d, jobPostings: it }),
  },
  {
    name: "amazon",
    url: "https://www.amazon.jobs/en/search.json?base_query=intern&offset=0&result_limit=100&sort=recent",
    items: (d) => d.jobs,
    trim: (d, it) => ({ ...d, jobs: it }),
  },
  {
    name: "simplify",
    url: "https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json",
    items: (d) => d,
    trim: (_d, it) => it,
  },
  {
    name: "eightfold",
    url: "https://explore.jobs.netflix.net/api/apply/v2/jobs?domain=netflix.com&start=0&num=50&query=intern&sort_by=timestamp",
    items: (d) => d.positions,
    trim: (d, it) => ({ positions: it, count: d.count }),
  },
  {
    name: "eightfold-pcsx",
    url: "https://careers.qualcomm.com/api/pcsx/search?domain=qualcomm.com&query=intern&location=&start=0&sort_by=timestamp",
    items: (d) => d.data?.positions,
    trim: (d, it) => ({ ...d, data: { ...d.data, positions: it } }),
  },
  {
    name: "oracle",
    url:
      "https://jpmc.fa.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList&finder=" +
      encodeURIComponent("findReqs;siteNumber=CX_1001,limit=50,sortBy=POSTING_DATES_DESC,keyword=intern"),
    items: (d) => d.items?.[0]?.requisitionList,
    trim: (d, it) => ({ ...d, items: [{ ...d.items[0], requisitionList: it }] }),
  },
];

function shape(o: any, depth = 0): string {
  if (o === null) return "null";
  if (Array.isArray(o)) return `[${o.length ? shape(o[0], depth + 1) : ""}]`;
  if (typeof o === "object") {
    if (depth > 1) return "{…}";
    return `{ ${Object.keys(o)
      .slice(0, 25)
      .map((k) => `${k}: ${shape(o[k], depth + 1)}`)
      .join(", ")} }`;
  }
  return typeof o;
}

for (const p of probes) {
  try {
    const { status, data } = await fetchJson<any>(p.url, { method: p.method, body: p.body, retries: 0 });
    const items = p.items(data) ?? [];
    console.log(`\n✅ ${p.name} — HTTP ${status}, ${items.length} items`);
    console.log("   item shape:", shape(items[0]).slice(0, 700));
    if (SAVE && p.trim) {
      const sample = items.slice(0, 5).map((x: any) => {
        // keep fixtures small: truncate long description fields
        const y = { ...x };
        for (const k of ["content", "descriptionPlain", "description", "descriptionHtml", "job_description"]) {
          if (typeof y[k] === "string" && y[k].length > 600) y[k] = y[k].slice(0, 600);
        }
        return y;
      });
      writeFileSync(`tests/fixtures/${p.name}.json`, JSON.stringify(p.trim(data, sample), null, 2));
    }
  } catch (e) {
    console.log(`\n❌ ${p.name} — ${(e as Error).message}`);
  }
}
