/** A posting as parsed from a source, before classification/scoring. */
export interface RawJob {
  externalId: string;
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
  /** epoch ms, or null if the source doesn't say */
  postedAt: number | null;
  category?: string;
  /** "₹10,000–15,000 / month" — only when the source says */
  stipend?: string | null;
  /** application deadline, epoch ms */
  deadline?: number | null;
  /** company logo URL when the source provides one (aggregates) */
  logo?: string | null;
}

export type SourceConfig =
  | { ats: "greenhouse"; slug: string }
  | { ats: "lever"; slug: string }
  | { ats: "ashby"; slug: string }
  | { ats: "smartrecruiters"; slug: string; maxPages?: number }
  /** host like "nvidia.wd5.myworkdayjobs.com" */
  | { ats: "workday"; host: string; tenant: string; site: string }
  /** host like "careers.qualcomm.com" */
  | { ats: "eightfold"; host: string; domain: string }
  /** host like "jpmc.fa.oraclecloud.com", site like "CX_1001" */
  | { ats: "oracle"; host: string; site: string }
  | { ats: "amazon" }
  /** GitHub repo like "SimplifyJobs/Summer2027-Internships" */
  | { ats: "simplify"; repo: string; branch?: string }
  /** Unstop public API (robots.txt allows /api/public/*) — mostly India */
  | { ats: "unstop"; kind: "internships" | "jobs" };

export type AtsKind = SourceConfig["ats"];

export interface FetchContext {
  /** Company display name, used when the source doesn't carry one. */
  company: string;
  now: number;
  getEtag?: () => Promise<string | null>;
  /** small per-source cache (e.g. a Workday tenant's India facet id) */
  cacheGet?: <T>(key: string) => Promise<T | null>;
  cacheSet?: (key: string, value: unknown) => Promise<void>;
  setEtag?: (etag: string) => Promise<void>;
}

export type FetchOutcome = { jobs: RawJob[]; unchanged?: false } | { unchanged: true };
