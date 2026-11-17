import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dedupeKey } from "../src/lib/normalize";
import { htmlToText, slugCandidates } from "../src/lib/text";
import { configFromUrl } from "../src/sources/discover";
import * as P from "../src/sources/parsers";
import type { RawJob } from "../src/sources/types";

const fx = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));
const NOW = Date.UTC(2026, 10, 17);

/** Every parsed job must have the basics — parsing should break loudly, not silently. */
function expectValid(jobs: RawJob[], min = 1) {
  expect(jobs.length).toBeGreaterThanOrEqual(min);
  for (const j of jobs) {
    expect(j.externalId, "externalId").toBeTruthy();
    expect(j.title, "title").toBeTruthy();
    expect(j.company, "company").toBeTruthy();
    expect(j.url, "url").toMatch(/^https:\/\//);
    expect(typeof j.location).toBe("string");
    expect(typeof j.description).toBe("string");
    if (j.postedAt !== null) {
      expect(j.postedAt).toBeGreaterThan(Date.UTC(2015, 0, 1));
      expect(j.postedAt).toBeLessThan(Date.UTC(2030, 0, 1));
    }
  }
}

describe("source parsers", () => {
  it("greenhouse", () => {
    const jobs = P.parseGreenhouse(fx("greenhouse"), "Stripe");
    expectValid(jobs, 5);
    expect(jobs[0].postedAt).not.toBeNull();
    expect(jobs[0].description).not.toMatch(/&lt;|<h2>/); // HTML decoded and stripped
    expect(jobs[0].url).toContain("stripe");
  });

  it("lever", () => {
    const jobs = P.parseLever(fx("lever"), "Palantir");
    expectValid(jobs, 5);
    expect(jobs.every((j) => j.postedAt !== null)).toBe(true);
    expect(jobs[0].url).toContain("jobs.lever.co");
  });

  it("ashby", () => {
    const jobs = P.parseAshby(fx("ashby"), "OpenAI");
    expectValid(jobs, 5);
    expect(jobs[0].url).toContain("ashbyhq.com");
    expect(jobs[0].description.length).toBeGreaterThan(50);
  });

  it("smartrecruiters", () => {
    const jobs = P.parseSmartRecruiters(fx("smartrecruiters"), "Bosch", "BoschGroup");
    expectValid(jobs, 5);
    expect(jobs[0].url).toBe(`https://jobs.smartrecruiters.com/BoschGroup/${jobs[0].externalId}`);
    expect(jobs[0].location).toMatch(/,/);
  });

  it("workday", () => {
    const jobs = P.parseWorkday(fx("workday"), "Nvidia", "nvidia.wd5.myworkdayjobs.com", "NVIDIAExternalCareerSite", NOW);
    expectValid(jobs, 5);
    expect(jobs[0].url).toMatch(/^https:\/\/nvidia\.wd5\.myworkdayjobs\.com\/NVIDIAExternalCareerSite\/job\//);
  });

  it("workday postedOn", () => {
    const D = 86_400_000;
    expect(P.parseWorkdayPostedOn("Posted Today", NOW)).toBe(NOW);
    expect(P.parseWorkdayPostedOn("Posted Yesterday", NOW)).toBe(NOW - D);
    expect(P.parseWorkdayPostedOn("Posted 3 Days Ago", NOW)).toBe(NOW - 3 * D);
    expect(P.parseWorkdayPostedOn("Posted 30+ Days Ago", NOW)).toBe(NOW - 30 * D);
    expect(P.parseWorkdayPostedOn(undefined, NOW)).toBeNull();
  });

  it("eightfold (classic v2)", () => {
    const jobs = P.parseEightfold(fx("eightfold"), "Netflix", "explore.jobs.netflix.net");
    expectValid(jobs, 3);
    expect(jobs.every((j) => j.postedAt !== null)).toBe(true);
  });

  it("eightfold (PCSX)", () => {
    const jobs = P.parseEightfold(fx("eightfold-pcsx"), "Qualcomm", "careers.qualcomm.com");
    expectValid(jobs, 5);
    expect(jobs[0].url).toMatch(/^https:\/\/careers\.qualcomm\.com\/careers\/job\//);
  });

  it("oracle", () => {
    const jobs = P.parseOracle(fx("oracle"), "JPMorgan Chase", "jpmc.fa.oraclecloud.com", "CX_1001");
    expectValid(jobs, 5);
    expect(jobs[0].url).toContain("/sites/CX_1001/job/");
  });

  it("amazon", () => {
    const jobs = P.parseAmazon(fx("amazon"));
    expectValid(jobs, 5);
    expect(jobs[0].company).toMatch(/^Amazon/);
    expect(jobs[0].url).toMatch(/^https:\/\/www\.amazon\.jobs\/en\/jobs\//);
    expect(jobs.every((j) => j.postedAt !== null)).toBe(true);
  });

  it("simplify keeps only active, visible, recent", () => {
    const raw = fx("simplify") as any[];
    const newest = Math.max(...raw.map((r) => r.date_posted)) * 1000;
    const jobs = P.parseSimplify(raw, newest + 86_400_000);
    expectValid(jobs, 1);
    const expected = raw.filter((r) => r.active && r.is_visible && r.date_posted * 1000 >= newest + 86_400_000 - 60 * 86_400_000);
    expect(jobs.length).toBe(expected.length);
    expect(jobs.length).toBeLessThan(raw.length); // fixture includes inactive + hidden rows
    // 60-day cutoff
    expect(P.parseSimplify(raw, newest + 61 * 86_400_000)).toHaveLength(0);
  });

  it("parsers throw on unexpected shapes", () => {
    expect(() => P.parseGreenhouse({ nope: 1 }, "x")).toThrow(/unexpected response shape/);
    expect(() => P.parseLever({}, "x")).toThrow();
    expect(() => P.parseWorkday({}, "x", "h", "s", NOW)).toThrow();
  });
});

describe("helpers", () => {
  it("htmlToText decodes Greenhouse double-escaped HTML", () => {
    expect(htmlToText("&lt;p&gt;Hello &amp;amp; welcome&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Python&lt;/li&gt;&lt;/ul&gt;")).toBe("Hello & welcome\n• Python");
  });

  it("dedupeKey matches the same role across sources", () => {
    expect(dedupeKey("Stripe, Inc.", "Software Engineer Intern (Summer 2027)", "San Francisco, CA / Remote")).toBe(
      dedupeKey("Stripe", "Software Engineer Internship - Summer 2027", "San Francisco, California"),
    );
    expect(dedupeKey("Stripe", "SWE Intern", "London")).not.toBe(dedupeKey("Stripe", "SWE Intern", "Dublin"));
  });

  it("slugCandidates", () => {
    expect(slugCandidates("Scale AI")).toContain("scale"); // "ai" suffix stripped → one word
    expect(slugCandidates("Safe Superintelligence")).not.toContain("safe");
    expect(slugCandidates("Hugging Face")).toContain("huggingface");
    expect(slugCandidates("Hugging Face")).toContain("hugging-face");
  });

  it("configFromUrl recognises careers URLs", () => {
    expect(configFromUrl("https://boards.greenhouse.io/stripe")).toEqual({ ats: "greenhouse", slug: "stripe" });
    expect(configFromUrl("https://job-boards.greenhouse.io/anthropic/jobs/123")).toEqual({ ats: "greenhouse", slug: "anthropic" });
    expect(configFromUrl("https://jobs.lever.co/palantir/abc")).toEqual({ ats: "lever", slug: "palantir" });
    expect(configFromUrl("https://jobs.ashbyhq.com/openai")).toEqual({ ats: "ashby", slug: "openai" });
    expect(configFromUrl("https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite")).toEqual({
      ats: "workday", host: "nvidia.wd5.myworkdayjobs.com", tenant: "nvidia", site: "NVIDIAExternalCareerSite",
    });
    expect(configFromUrl("not a url")).toBeNull();
  });
});

import { atsIdFromUrl } from "../src/lib/normalize";
describe("atsIdFromUrl", () => {
  it("extracts the ATS job id from apply URLs", () => {
    expect(atsIdFromUrl("https://job-boards.greenhouse.io/aircapture/jobs/4665737006")).toBe("4665737006");
    expect(atsIdFromUrl("https://stripe.com/jobs/search?gh_jid=7539386")).toBe("7539386");
    expect(atsIdFromUrl("https://jobs.ashbyhq.com/treefera/800f0bc8-ca10-4d6e-8b89-f9bc8867e63f/application")).toBe("800f0bc8-ca10-4d6e-8b89-f9bc8867e63f");
    expect(atsIdFromUrl("https://jobs.smartrecruiters.com/BoschGroup/744000161888438")).toBe("744000161888438");
    expect(atsIdFromUrl("https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/China-Shanghai/DFT-Intern---2027_JR2027176")).toBe("JR2027176");
    expect(atsIdFromUrl("https://www.amazon.jobs/en/jobs/10605141/data-center-intern")).toBe("10605141");
    expect(atsIdFromUrl("not a url")).toBeNull();
  });
});

describe("unstop", () => {
  it("parses internships with stipend, deadline and India location", () => {
    const jobs = P.parseUnstop(fx("unstop"));
    expectValid(jobs, 5);
    expect(jobs[0].url).toMatch(/^https:\/\/unstop\.com\//);
    expect(jobs.every((j) => /India/.test(j.location))).toBe(true);
    expect(jobs.some((j) => j.stipend && /₹/.test(j.stipend))).toBe(true);
    expect(jobs.every((j) => j.deadline == null || j.deadline > Date.UTC(2025, 0, 1))).toBe(true);
    expect(jobs[0].postedAt).toBeGreaterThan(Date.UTC(2025, 0, 1));
  });
  it("formats stipends", () => {
    expect(P.unstopStipend({ min_salary: 5000, max_salary: 10000, show_salary: 1, pay_in: "monthly" })).toBe("₹5,000–10,000 / month");
    expect(P.unstopStipend({ paid_unpaid: "unpaid" })).toBe("Unpaid");
    expect(P.unstopStipend({ max_salary: 900000, show_salary: 1, pay_in: "yearly" })).toBe("₹9,00,000 / year");
    expect(P.unstopStipend({ not_disclosed: true, max_salary: 5 })).toBeNull();
  });
});
