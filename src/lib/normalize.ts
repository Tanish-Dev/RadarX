import { slugify } from "./text";

const COMPANY_NOISE = /\b(inc|llc|ltd|limited|corp|corporation|plc|gmbh|co|company|technologies|technology|group|holdings|pvt|private)\b\.?/g;

/** "Stripe, Inc." → "stripe" — used for company_key on aggregate sources and in dedupe_key. */
export function companyKey(name: string): string {
  return slugify(name.toLowerCase().replace(/\(.*?\)/g, "").replace(COMPANY_NOISE, "")) || slugify(name);
}

function normTitle(t: string): string {
  return t
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/\binternship\b/g, "intern")
    .replace(/\b(summer|fall|winter|spring)\s*(20\d\d)?\b/g, " ")
    .replace(/\b20\d\d\b/g, " ")
    .replace(/[^a-z0-9+#]+/g, " ")
    .trim();
}

function normLocation(l: string): string {
  // first location only, city part only: "San Francisco, CA / Remote" → "san francisco"
  const first = l.split(/\s*[\/;|]\s*|\s+or\s+/i)[0] ?? "";
  return first.split(",")[0].toLowerCase().replace(/[^a-z]+/g, " ").trim();
}

/** Same role from Simplify and from the company ATS → same key. */
export function dedupeKey(company: string, title: string, location: string): string {
  return `${companyKey(company)}|${normTitle(title)}|${normLocation(location)}`;
}

/**
 * The ATS job id inside an apply URL, so a Simplify row can be linked to the same
 * posting fetched directly from the company's ATS (whose company name may differ,
 * e.g. "Robert Bosch Venture Capital" vs "Bosch").
 */
export function atsIdFromUrl(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const gh = u.searchParams.get("gh_jid");
  if (gh) return gh;
  const path = u.pathname.replace(/\/(apply|application)\/?$/i, "");
  if (/myworkdayjobs\.com$/i.test(u.hostname)) {
    const last = path.split("/").filter(Boolean).pop() ?? "";
    const i = last.lastIndexOf("_");
    return i >= 0 ? last.slice(i + 1) : null; // ".../DFT-Intern---2027_JR2027176" → "JR2027176"
  }
  const uuid = path.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (uuid) return uuid[0].toLowerCase();
  const num = path.match(/(?:^|\/)(\d{6,})(?:\/|$|-)/);
  return num ? num[1] : null;
}
