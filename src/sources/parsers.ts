/**
 * Pure parsers: raw API response → RawJob[]. No network here, so every parser
 * is covered by a fixture test in tests/adapters.test.ts.
 */
import { clip, htmlToText } from "../lib/text";
import type { RawJob } from "./types";

const DAY = 86_400_000;

const toMs = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v < 1e12 ? v * 1000 : v; // seconds vs ms
  const n = Number(v);
  if (Number.isFinite(n) && /^\d+$/.test(String(v))) return n < 1e12 ? n * 1000 : n;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : null;
};

function must(arr: unknown, source: string): any[] {
  if (!Array.isArray(arr)) throw new Error(`${source}: unexpected response shape (no job array)`);
  return arr;
}

// ── Greenhouse ───────────────────────────────────────────────────────────────
export function parseGreenhouse(data: any, company: string): RawJob[] {
  return must(data?.jobs, "greenhouse").map((j) => ({
    externalId: String(j.id),
    title: String(j.title ?? "").trim(),
    company: j.company_name || company,
    location: j.location?.name ?? "",
    url: j.absolute_url,
    description: clip(htmlToText(j.content)),
    postedAt: toMs(j.first_published ?? j.updated_at),
  }));
}

// ── Lever ────────────────────────────────────────────────────────────────────
export function parseLever(data: any, company: string): RawJob[] {
  return must(data, "lever").map((j) => {
    const locs: string[] = j.categories?.allLocations?.length
      ? j.categories.allLocations
      : [j.categories?.location].filter(Boolean);
    const remote = j.workplaceType === "remote" && !locs.some((l) => /remote/i.test(l)) ? ["Remote"] : [];
    return {
      externalId: String(j.id),
      title: String(j.text ?? "").trim(),
      company,
      location: [...locs, ...remote].join(" / "),
      url: j.hostedUrl,
      description: clip(
        [j.descriptionPlain, ...(j.lists ?? []).map((l: any) => `${l.text}\n${htmlToText(l.content)}`), j.additionalPlain]
          .filter(Boolean)
          .join("\n\n"),
      ),
      postedAt: toMs(j.createdAt),
      category: j.categories?.commitment,
    };
  });
}

// ── Ashby ────────────────────────────────────────────────────────────────────
export function parseAshby(data: any, company: string): RawJob[] {
  return must(data?.jobs, "ashby")
    .filter((j) => j.isListed !== false)
    .map((j) => {
      const locs = [j.location, ...(j.secondaryLocations ?? []).map((s: any) => s.location ?? s)].filter(
        (x) => typeof x === "string" && x,
      );
      if (j.isRemote && !locs.some((l: string) => /remote/i.test(l))) locs.push("Remote");
      return {
        externalId: String(j.id),
        title: String(j.title ?? "").trim(),
        company,
        location: locs.join(" / "),
        url: j.jobUrl,
        description: clip(j.descriptionPlain ?? htmlToText(j.descriptionHtml)),
        postedAt: toMs(j.publishedAt),
        category: j.employmentType,
      };
    });
}

// ── SmartRecruiters ──────────────────────────────────────────────────────────
export function parseSmartRecruiters(data: any, company: string, slug: string): RawJob[] {
  return must(data?.content, "smartrecruiters").map((j) => {
    const l = j.location ?? {};
    const loc = l.fullLocation || [l.city, l.region, l.country?.toUpperCase()].filter(Boolean).join(", ");
    return {
      externalId: String(j.id),
      title: String(j.name ?? "").trim(),
      company: j.company?.name || company,
      location: l.remote ? `${loc} / Remote` : loc,
      url: `https://jobs.smartrecruiters.com/${slug}/${j.id}`,
      description: "",
      postedAt: toMs(j.releasedDate),
      category: j.typeOfEmployment?.label,
    };
  });
}

// ── Workday ──────────────────────────────────────────────────────────────────
/** "Posted Today" / "Posted Yesterday" / "Posted 3 Days Ago" / "Posted 30+ Days Ago" → epoch ms */
export function parseWorkdayPostedOn(s: string | undefined, now: number): number | null {
  if (!s) return null;
  const t = s.toLowerCase();
  if (t.includes("today")) return now;
  if (t.includes("yesterday")) return now - DAY;
  const m = t.match(/(\d+)\+?\s*day/);
  if (m) return now - Number(m[1]) * DAY;
  return null;
}

export function parseWorkday(data: any, company: string, host: string, site: string, now: number): RawJob[] {
  return must(data?.jobPostings, "workday")
    .filter((j) => j.externalPath && j.title)
    .map((j) => ({
      externalId: j.bulletFields?.[0] ? String(j.bulletFields[0]) : String(j.externalPath),
      title: String(j.title).trim(),
      company,
      location: j.locationsText ?? "",
      url: `https://${host}/${site}${j.externalPath}`,
      description: "",
      postedAt: parseWorkdayPostedOn(j.postedOn, now),
    }));
}

// ── Eightfold (classic v2 API and the newer PCSX API) ───────────────────────
export function parseEightfold(data: any, company: string, host: string): RawJob[] {
  const pcsx = data?.data?.positions;
  if (Array.isArray(pcsx)) {
    return pcsx.map((j: any) => ({
      externalId: String(j.id),
      title: String(j.name ?? "").trim(),
      company,
      location: (j.locations ?? []).join(" / ") + (j.workLocationOption === "remote" ? " / Remote" : ""),
      url: j.positionUrl?.startsWith("http") ? j.positionUrl : `https://${host}${j.positionUrl ?? `/careers/job/${j.id}`}`,
      description: "",
      postedAt: toMs(j.postedTs ?? j.creationTs),
      category: j.department,
    }));
  }
  return must(data?.positions, "eightfold").map((j: any) => ({
    externalId: String(j.id),
    title: String(j.name ?? j.posting_name ?? "").trim(),
    company,
    location: j.location ?? "",
    url: j.canonicalPositionUrl || `https://${host}/careers/job/${j.id}`,
    description: htmlToText(j.job_description),
    postedAt: toMs(j.t_create ?? j.t_update),
    category: j.department,
  }));
}

// ── Oracle Recruiting Cloud ─────────────────────────────────────────────────
export function parseOracle(data: any, company: string, host: string, site: string): RawJob[] {
  const list = data?.items?.[0]?.requisitionList;
  return must(list, "oracle").map((j: any) => ({
    externalId: String(j.Id),
    title: String(j.Title ?? "").trim(),
    company,
    location: j.PrimaryLocation ?? "",
    url: `https://${host}/hcmUI/CandidateExperience/en/sites/${site}/job/${j.Id}`,
    description: [j.ShortDescriptionStr, j.ExternalResponsibilitiesStr, j.ExternalQualificationsStr]
      .filter(Boolean)
      .map(htmlToText)
      .join("\n\n"),
    postedAt: toMs(j.PostedDate),
    category: j.JobFamily,
  }));
}

// ── Amazon ───────────────────────────────────────────────────────────────────
export function parseAmazon(data: any): RawJob[] {
  return must(data?.jobs, "amazon").map((j: any) => ({
    externalId: String(j.id_icims ?? j.id),
    title: String(j.title ?? "").trim(),
    company: j.company_name && !/^amazon/i.test(j.company_name) ? `Amazon (${j.company_name})` : "Amazon",
    location: j.normalized_location || j.location || "",
    url: `https://www.amazon.jobs${j.job_path}`,
    description: clip(
      [htmlToText(j.description), "Basic qualifications:\n" + htmlToText(j.basic_qualifications), htmlToText(j.preferred_qualifications)]
        .filter(Boolean)
        .join("\n\n"),
    ),
    postedAt: toMs(j.posted_date),
    category: j.job_category,
  }));
}

// ── SimplifyJobs community lists ────────────────────────────────────────────
export function parseSimplify(data: any, now: number, maxAgeDays = 60): RawJob[] {
  const cutoff = now - maxAgeDays * DAY;
  return must(data, "simplify")
    .filter((j) => j.active && j.is_visible && toMs(j.date_posted)! >= cutoff)
    .map((j) => ({
      externalId: String(j.id),
      title: String(j.title ?? "").trim(),
      company: j.company_name,
      location: (j.locations ?? []).join(" / "),
      url: j.url,
      description: "", // the list only has "terms" (e.g. "Summer 2027", "N/A") — not a description
      postedAt: toMs(j.date_posted),
      category: j.category,
    }));
}

// ── Detail endpoints (enrichment for list APIs that omit the description) ──
export interface JobDetail {
  description: string;
  postedAt?: number | null;
}

export function parseWorkdayDetail(data: any): JobDetail {
  const i = data?.jobPostingInfo;
  if (!i) throw new Error("workday detail: unexpected response shape");
  return { description: clip(htmlToText(i.jobDescription)), postedAt: toMs(i.startDate) };
}

export function parseSmartRecruitersDetail(data: any): JobDetail {
  const sec = data?.jobAd?.sections;
  if (!sec) throw new Error("smartrecruiters detail: unexpected response shape");
  const parts = ["jobDescription", "qualifications", "additionalInformation"]
    .map((k) => sec[k])
    .filter((s) => s?.text)
    .map((s) => `${s.title ? s.title + "\n" : ""}${htmlToText(s.text)}`);
  return { description: clip(parts.join("\n\n")), postedAt: toMs(data.releasedDate) };
}

// ── Unstop (India) ──────────────────────────────────────────────────────────
const PAY_IN: Record<string, string> = { monthly: "month", yearly: "year", weekly: "week", daily: "day", lumpsum: "total" };
const inr = (n: number) => n.toLocaleString("en-IN");

export function unstopStipend(d: any): string | null {
  if (!d) return null;
  if (d.paid_unpaid === "unpaid") return "Unpaid";
  if (d.not_disclosed || !d.show_salary) return null;
  const lo = Number(d.min_salary) || 0, hi = Number(d.max_salary) || 0;
  if (!lo && !hi) return null;
  const per = PAY_IN[d.pay_in] ?? d.pay_in ?? "";
  const amt = lo && hi && lo !== hi ? `₹${inr(lo)}–${inr(hi)}` : `₹${inr(hi || lo)}`;
  return per ? `${amt} / ${per}` : amt;
}

/** "2026-11-17 10:19:35 GMT+0530" → epoch ms */
function unstopDate(s: unknown): number | null {
  if (!s) return null;
  const m = String(s).match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})\s*(?:GMT)?([+-]\d{2}):?(\d{2})?/);
  if (m) return Date.parse(`${m[1]}T${m[2]}${m[3]}:${m[4] ?? "00"}`);
  return toMs(s);
}

export function parseUnstop(data: any): RawJob[] {
  return must(data?.data?.data, "unstop").map((j: any) => {
    const d = j.jobDetail ?? {};
    const cities: string[] = (j.locations ?? []).map((l: any) => l.city).filter(Boolean);
    const remote = d.type === "wfh" || d.type === "remote" || (j.region === "online" && !cities.length);
    const loc = [...new Set(cities)].join(" / ");
    const country = (j.locations ?? [])[0]?.country ?? "India";
    const fresher = (j.filters ?? []).some((f: any) => /fresher/i.test(f.name ?? ""));
    return {
      externalId: String(j.id),
      title: String(j.title ?? "").trim(),
      company: j.organisation?.name ?? "Unknown",
      location: [loc && `${loc}, ${country}`, remote && "Remote (India)", d.type === "hybrid" && "Hybrid"].filter(Boolean).join(" / ") || country,
      url: j.seo_url || `https://unstop.com/${j.public_url}`,
      description: clip(
        [htmlToText(j.details), (j.required_skills ?? []).length ? "Skills: " + j.required_skills.map((s: any) => s.skill_name ?? s.skill).join(", ") : ""]
          .filter(Boolean)
          .join("\n\n"),
      ),
      postedAt: unstopDate(j.approved_date) ?? toMs(j.updated_at),
      category: j.subtype === "internships" ? "internship" : fresher ? "fresher" : j.subtype,
      stipend: unstopStipend(d),
      deadline: toMs(j.regnRequirements?.end_regn_dt ?? j.end_date),
      logo: j.organisation?.logoUrl || j.logoUrl2 || null,
    };
  });
}
