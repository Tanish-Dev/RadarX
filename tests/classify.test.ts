import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classify, classifyLevel, classifyRegion, isTech } from "../src/lib/classify";
import { inQuietHours } from "../src/lib/settings";
import { scoreJob, DEFAULT_PROFILE } from "../src/lib/score";
import { extractSkills } from "../src/lib/skills";
import { parseSmartRecruitersDetail, parseWorkdayDetail } from "../src/sources/parsers";

const fx = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));

describe("isTech", () => {
  it.each([
    "Software Engineer Intern",
    "Machine Learning Engineer, New Grad",
    "Data Scientist I",
    "SDE Intern - Summer 2027",
    "Research Intern - Computer Vision",
    "Firmware Engineer",
    "DFT Intern - 2027",
    "Quantitative Researcher",
    "Site Reliability Engineer",
    "Product Designer (UX)",
    "Linux Driver Engineer",
    "Security Engineer Intern",
    "Full-Stack Developer",
    "Formal Methods Research and Development Intern",
    "InfoSec Analyst",
  ])("tech: %s", (t) => expect(isTech(t)).toBe(true));

  it.each([
    "Account Executive",
    "Technical Recruiter",
    "Sales Engineer",
    "Customer Success Manager",
    "Marketing Intern",
    "Legal Counsel",
    "Civil Engineer",
    "HR Business Partner",
    "Executive Assistant",
    "Payroll Specialist",
  ])("non-tech: %s", (t) => expect(isTech(t)).toBe(false));
});

describe("level", () => {
  it.each([
    ["Software Engineer Intern", "intern"],
    ["Software Engineering Internship, Summer 2027", "intern"],
    ["Co-op, Embedded Software", "intern"],
    ["Summer Analyst - Technology", "intern"],
    ["Research Intern, LLM Reasoning", "research"],
    ["Student Researcher, PhD", "research"],
    ["Software Engineer, New Grad 2027", "newgrad"],
    ["Graduate Software Engineer", "newgrad"],
    ["Software Engineer I", "newgrad"],
    ["Associate Software Engineer", "newgrad"],
    ["Early Career Data Scientist", "newgrad"],
    ["Senior Software Engineer", "experienced"],
    ["Staff ML Engineer", "experienced"],
    ["Software Engineer II", "experienced"],
    ["Staff Engineer I", "experienced"],
    ["Senior Associate Software Engineer", "experienced"],
    ["GPU Architect - New College Graduate 2027", "newgrad"],
  ] as const)("%s → %s", (t, l) => expect(classifyLevel(t)).toBe(l));

  it("uses the source hint when the title is ambiguous", () => {
    expect(classifyLevel("Software Engineer", "", "newgrad")).toBe("newgrad");
    expect(classifyLevel("Senior Software Engineer", "", "newgrad")).toBe("experienced");
  });

  it("reads 0–2 years from the description", () => {
    expect(classifyLevel("Software Engineer", "We want 0-2 years of experience")).toBe("newgrad");
  });
});

describe("region", () => {
  it.each([
    ["Bengaluru, Karnataka, India", "india"],
    ["Pune", "india"],
    ["Gurugram / Remote", "india"],
    ["Remote - India", "india"],
    ["Remote, US", "global"],
    ["Remote in USA", "global"],
    ["Virtual US", "global"],
    ["US Remote", "global"],
    ["Remote (UK)", "global"],
    ["Remote in Canada / Remote in USA", "global"],
    ["Remote", "remote"],
    ["Remote - Worldwide", "remote"],
    ["Anywhere", "remote"],
    ["San Francisco, CA / Remote", "remote"],
    ["Indianapolis, IN", "global"],
    ["Indiana, United States", "global"],
    ["San Francisco, CA", "global"],
    ["London, United Kingdom", "global"],
  ] as const)("%s → %s", (l, r) => expect(classifyRegion(l)).toBe(r));
});

describe("skills", () => {
  it("extracts canonical skills with aliases", () => {
    const s = extractSkills("Experience with PyTorch, k8s, ReactJS, Node.js and Postgres. Familiar with LLMs and RAG.");
    expect(s).toEqual(expect.arrayContaining(["PyTorch", "Kubernetes", "React", "Node.js", "PostgreSQL", "LLMs", "RAG"]));
  });

  it("keeps C, C++ and C# apart", () => {
    expect(extractSkills("Strong C++ skills")).toEqual(["C++"]);
    expect(extractSkills("C# and .NET")).toEqual(expect.arrayContaining(["C#", ".NET"]));
    expect(extractSkills("C# and .NET")).not.toContain("C");
  });

  it("doesn't match English words for ambiguous skills", () => {
    const s = extractSkills("You will go above and beyond, react quickly, and excel in a swift-moving team. Spring 2027.");
    expect(s).not.toContain("Go");
    expect(s).not.toContain("React");
    expect(s).not.toContain("Excel");
    expect(s).not.toContain("Swift");
    expect(s).not.toContain("Spring Boot");
    expect(extractSkills("Backend in Go and Rust")).toEqual(expect.arrayContaining(["Go", "Rust"]));
  });

  it("does not match java inside javascript", () => {
    expect(extractSkills("JavaScript developer")).toEqual(["JavaScript"]);
  });
});

describe("score", () => {
  const job = (skills: string[], titleSkills: string[] = [], level = "intern", region = "india") =>
    ({ skills, titleSkills, level, region, is_tech: true }) as any;

  it("is null without a resume", () => {
    expect(scoreJob(job(["Python"]), DEFAULT_PROFILE)).toBeNull();
  });

  it("ranks better skill overlap higher, and title matches higher still", () => {
    const p = { ...DEFAULT_PROFILE, skills: ["Python", "PyTorch", "Machine learning", "SQL"] };
    const great = scoreJob(job(["Python", "PyTorch", "Machine learning"], ["Machine learning"]), p)!;
    const ok = scoreJob(job(["Python", "Java", "Kubernetes", "Go"]), p)!;
    const none = scoreJob(job(["Java", "Kubernetes"]), p)!;
    expect(great.score).toBeGreaterThan(ok.score);
    expect(ok.score).toBeGreaterThan(none.score);
    expect(great.score).toBeLessThanOrEqual(100);
    expect(great.matched).toEqual(["Python", "PyTorch", "Machine learning"]);
    expect(none.missing).toEqual(["Java", "Kubernetes"]);
  });

  it("gives level/region preference a bonus", () => {
    const p = { ...DEFAULT_PROFILE, skills: ["Python"] };
    expect(scoreJob(job(["Python"], [], "intern", "india"), p)!.score).toBeGreaterThan(
      scoreJob(job(["Python"], [], "experienced", "global"), p)!.score,
    );
  });
});

describe("classify()", () => {
  it("combines everything", () => {
    const c = classify({ title: "Machine Learning Intern", description: "Python, PyTorch, Docker", location: "Pune, India" });
    expect(c).toMatchObject({ is_tech: true, level: "intern", region: "india", domain: "ai" });
    expect(c.titleSkills).toEqual(["Machine learning"]);
    expect(c.skills).toEqual(expect.arrayContaining(["Machine learning", "Python", "PyTorch", "Docker"]));
  });
});

describe("quiet hours (IST)", () => {
  const q = { enabled: true, start: "23:30", end: "07:00" };
  const ist = (h: number, m = 0) => Date.UTC(2026, 10, 17, h, m) - 330 * 60_000; // that wall-clock time in IST
  it("handles windows crossing midnight", () => {
    expect(inQuietHours(q, ist(23, 45))).toBe(true);
    expect(inQuietHours(q, ist(3))).toBe(true);
    expect(inQuietHours(q, ist(7, 0))).toBe(false);
    expect(inQuietHours(q, ist(12))).toBe(false);
    expect(inQuietHours({ ...q, enabled: false }, ist(3))).toBe(false);
  });
});

describe("detail parsers", () => {
  it("workday detail", () => {
    const d = parseWorkdayDetail(fx("workday-detail"));
    expect(d.description.length).toBeGreaterThan(100);
    expect(d.description).not.toMatch(/<p>/);
    expect(d.postedAt).toBeGreaterThan(Date.UTC(2020, 0, 1));
  });
  it("smartrecruiters detail", () => {
    const d = parseSmartRecruitersDetail(fx("smartrecruiters-detail"));
    expect(d.description.length).toBeGreaterThan(100);
  });
});

import { geocode } from "../src/data/cities";
describe("geocode", () => {
  it("finds cities in messy location strings", () => {
    expect(geocode("Bengaluru, Karnataka, India").map((c) => c.name)).toEqual(["Bengaluru"]);
    expect(geocode("Bangalore / Hyderabad, Telangāna, India").map((c) => c.name)).toEqual(["Bengaluru", "Hyderabad"]);
    expect(geocode("Gurgaon").map((c) => c.name)).toEqual(["Gurugram"]);
    expect(geocode("San Francisco, CA / Remote").map((c) => c.name)).toEqual(["San Francisco"]);
    expect(geocode("Remote in India")).toEqual([]);
    expect(geocode("Washington, DC").map((c) => c.name)).toEqual(["Washington"]);
    expect(geocode("Vashi, India").map((c) => c.name)).toEqual(["Mumbai"]);
  });
});
