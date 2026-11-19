import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { middleware, buildCsp } from "../src/middleware";
import { safeHttpUrl } from "../src/lib/url";
import { OWNER_COOKIE, createSession, openDevMode, passwordMatches, safeNext, verifySession } from "../src/lib/owner";
import { _resetRateLimits, clientIp, rateLimit, refund } from "../src/lib/ratelimit";
import { parseFilters, sanitizeFilters } from "../src/lib/filters";
import { parseVisitorProfile } from "../src/lib/visitorProfile";

const env = process.env as Record<string, string | undefined>;
const saved = { ...env };
afterEach(() => {
  for (const k of ["OWNER_PASSWORD", "DASHBOARD_PASSWORD", "SESSION_SECRET", "VERCEL", "NODE_ENV"]) {
    if (saved[k] === undefined) delete env[k];
    else env[k] = saved[k];
  }
});

describe("owner session", () => {
  beforeEach(() => (env.OWNER_PASSWORD = "correct horse battery staple"));

  it("round-trips a signed session and rejects tampering", async () => {
    const s = (await createSession())!;
    expect(await verifySession(s)).toBe(true);
    const [v, exp, sig] = s.split(".");
    expect(await verifySession(`${v}.${Number(exp) + 1}.${sig}`)).toBe(false); // extended expiry
    expect(await verifySession(`${v}.${exp}.${sig.slice(0, -2)}AA`)).toBe(false); // forged signature
    expect(await verifySession("")).toBe(false);
    expect(await verifySession("v1.9999999999999.x".repeat(20))).toBe(false);
  });

  it("expires, and changing the password signs everyone out", async () => {
    const s = (await createSession(Date.now() - 31 * 86_400_000))!;
    expect(await verifySession(s)).toBe(false);
    const fresh = (await createSession())!;
    env.OWNER_PASSWORD = "a different password";
    expect(await verifySession(fresh)).toBe(false);
  });

  it("compares passwords exactly", async () => {
    expect(await passwordMatches("correct horse battery staple")).toBe(true);
    expect(await passwordMatches("correct horse battery stapl")).toBe(false);
    expect(await passwordMatches("")).toBe(false);
    expect(await passwordMatches("x".repeat(10_000))).toBe(false);
  });

  it("is locked by default when hosted without a password", () => {
    delete env.OWNER_PASSWORD;
    env.VERCEL = "1";
    expect(openDevMode()).toBe(false);
    delete env.VERCEL;
    env.NODE_ENV = "production";
    expect(openDevMode()).toBe(false);
  });
});

describe("post-login redirect", () => {
  it("only allows same-site relative paths", () => {
    expect(safeNext("/settings")).toBe("/settings");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("/\\evil.example")).toBe("/");
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext("javascript:alert(1)")).toBe("/");
    expect(safeNext(undefined)).toBe("/");
  });
});

describe("middleware", () => {
  const req = (path: string, cookie?: string) => new NextRequest(`https://radarx.example${path}`, { headers: cookie ? { cookie } : {} });

  it("lets everyone read public pages, with security headers + a nonce CSP", async () => {
    env.OWNER_PASSWORD = "pw";
    const r = await middleware(req("/"));
    expect(r.status).toBe(200);
    const csp = r.headers.get("content-security-policy")!;
    expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(r.headers.get("x-frame-options")).toBe("DENY");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("sends visitors from owner pages to /login, lets the owner through", async () => {
    env.OWNER_PASSWORD = "pw";
    const visitor = await middleware(req("/settings"));
    expect(visitor.status).toBe(307);
    expect(visitor.headers.get("location")).toMatch(/\/login\?next=%2Fsettings$/);
    expect((await middleware(req("/design"))).status).toBe(307);
    expect((await middleware(req("/settings", `${OWNER_COOKIE}=forged.value`))).status).toBe(307);
    const s = (await createSession())!;
    expect((await middleware(req("/settings", `${OWNER_COOKIE}=${s}`))).status).toBe(200);
  });

  it("dev CSP allows eval + websockets only in development", () => {
    expect(buildCsp("n", true)).toContain("'unsafe-eval'");
    expect(buildCsp("n", false)).not.toContain("'unsafe-eval'");
    expect(buildCsp("n", false)).toContain("upgrade-insecure-requests");
  });
});

describe("rate limit", () => {
  beforeEach(() => _resetRateLimits());
  it("blocks after the limit within the window, then resets", () => {
    const t = 1_000_000;
    for (let i = 0; i < 5; i++) expect(rateLimit("k", 5, 60_000, t).ok).toBe(true);
    expect(rateLimit("k", 5, 60_000, t).ok).toBe(false);
    expect(rateLimit("other", 5, 60_000, t).ok).toBe(true);
    expect(rateLimit("k", 5, 60_000, t + 61_000).ok).toBe(true);
  });
  it("uses a client ip the client can't forge", () => {
    const onVercel = { VERCEL: "1" };
    // on Vercel, the edge's own header wins over anything the client put in x-forwarded-for
    expect(clientIp(new Headers({ "x-vercel-forwarded-for": "198.51.100.7", "x-forwarded-for": "1.2.3.4" }), onVercel)).toBe("198.51.100.7");
    // off Vercel those headers are client input → ignored unless a proxy is configured
    expect(clientIp(new Headers({ "x-vercel-forwarded-for": "6.6.6.6", "x-real-ip": "6.6.6.6", "x-forwarded-for": "1.2.3.4" }), {})).toBe("direct");
    expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" }), { TRUSTED_PROXY_HOPS: "1" })).toBe("203.0.113.9");
    expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 203.0.113.9, 10.0.0.2" }), { TRUSTED_PROXY_HOPS: "2" })).toBe("203.0.113.9");
    expect(clientIp(new Headers(), {})).toBe("direct");
  });
  it("refund takes back a reserved hit; flooding other keys never evicts a live lockout", () => {
    const t = 2_000_000;
    for (let i = 0; i < 5; i++) rateLimit("login-fail:9.9.9.9", 5, 60_000, t);
    rateLimit("ok", 1, 60_000, t);
    refund("ok");
    expect(rateLimit("ok", 1, 60_000, t).ok).toBe(true);
    for (let i = 0; i < 25_000; i++) rateLimit(`flood${i}`, 1, 60_000, t);
    expect(rateLimit("login-fail:9.9.9.9", 5, 60_000, t).ok).toBe(false); // still locked
    expect(rateLimit("flood24999", 1, 60_000, t).ok).toBe(false); // newest kept
    // lockout store full → new clients are refused, existing lockouts untouched
    for (let i = 0; i < 20_000; i++) rateLimit(`login-fail:ip${i}`, 5, 60_000, t);
    expect(rateLimit("login-fail:brand-new", 5, 60_000, t).ok).toBe(false);
    expect(rateLimit("login-fail:9.9.9.9", 5, 60_000, t).ok).toBe(false);
    // site-wide counters live apart and are never evicted
    rateLimit("x:*", 1, 60_000, t);
    expect(rateLimit("x:*", 1, 60_000, t).ok).toBe(false);
  });
  it("login reserves the attempt before checking the password (no parallel race), refunds on success", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../src/app/actions.ts", import.meta.url), "utf8");
    const login = src.slice(src.indexOf("export async function login"), src.indexOf("export async function logout"));
    expect(login.indexOf('rateLimit(`login-fail:${ip}`')).toBeGreaterThan(-1);
    expect(login.indexOf('rateLimit(`login-fail:${ip}`')).toBeLessThan(login.indexOf("passwordMatches"));
    expect(login.indexOf("refund(`login-fail:${ip}`)")).toBeGreaterThan(login.indexOf("passwordMatches"));
  });
});

describe("input caps", () => {
  it("URL filters are bounded and allow-listed", () => {
    const f = parseFilters({ q: "x".repeat(5000), loc: Array.from({ length: 500 }, (_, i) => `city${i}`).join("|"), level: "intern,admin;DROP", domain: "ai,evil", page: "99999999", job: "<script>" });
    expect(f.q.length).toBeLessThanOrEqual(80);
    expect(f.loc.split("|").length).toBeLessThanOrEqual(80);
    expect(f.level).toEqual(["intern"]);
    expect(f.domain).toEqual(["ai"]);
    expect(f.page).toBe(200);
    expect(f.job).toBe("");
  });
  it("filters from the client are re-validated", () => {
    const f = sanitizeFilters({ q: { $ne: 1 }, level: ["intern", 5, "root"], within: "forever", sort: "DROP TABLE", extra: "ignored" } as unknown);
    expect(f.q).toBe("");
    expect(f.level).toEqual(["intern"]);
    expect(f.within).toBe("");
    expect(f.sort).toBe("new");
    expect(sanitizeFilters(null)).toMatchObject({ q: "", level: [] });
  });
  it("visitor skills cookie keeps only known skills", () => {
    const p = parseVisitorProfile(encodeURIComponent(JSON.stringify({ s: ["Python", "<img onerror=alert(1)>", "react"], l: ["intern", "ceo"], r: ["india", "mars"] })));
    expect(p?.skills).toEqual(expect.arrayContaining(["Python"]));
    expect(p?.skills.some((s) => /</.test(s))).toBe(false);
    expect(p?.levels).toEqual(["intern"]);
    expect(p?.regions).toEqual(["india"]);
    expect(parseVisitorProfile("not json")).toBeNull();
    expect(parseVisitorProfile("x".repeat(5000))).toBeNull();
  });
});

describe("visitor resume upload", () => {
  it("rejects files that aren't a PDF or text", async () => {
    const { readResumeFile } = await import("../src/lib/resume");
    const enc = new TextEncoder();
    await expect(readResumeFile(enc.encode("<html>not a pdf"), "cv.pdf")).rejects.toThrow(/doesn't look like a PDF/);
    await expect(readResumeFile(new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0, 1, 2, 3]), "cv.txt")).rejects.toThrow(/PDF or a plain-text/);
    expect(await readResumeFile(enc.encode("Python, React and SQL"), "cv.txt")).toContain("React");
  });
  it("public poll + news refresh are throttled site-wide", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../src/app/actions.ts", import.meta.url), "utf8");
    expect(src).toMatch(/POLL_GAP_MS = 5 \* 60_000/);
    expect(src).toMatch(/lastPollAt\(\)/);
    expect(src).toMatch(/minGapMs: owner \? 2 \* 60_000 : 10 \* 60_000/);
  });
});

describe("safeHttpUrl", () => {
  it("allows http(s) only", () => {
    expect(safeHttpUrl("https://boards.greenhouse.io/x/jobs/1")).toBe("https://boards.greenhouse.io/x/jobs/1");
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,hi")).toBeNull();
    expect(safeHttpUrl("not a url")).toBeNull();
    expect(safeHttpUrl(null)).toBeNull();
  });
});

describe("server actions", () => {
  it("every action that changes shared state checks for the owner first", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../src/app/actions.ts", import.meta.url), "utf8");
    // public on purpose: sign-in/out, read-only helpers (rate-limited, input-capped, write nothing), and the
    // "check now" triggers, which take no input and share a site-wide cooldown stored in the DB
    const PUBLIC = new Set(["login", "logout", "extractVisitorSkills", "extractVisitorResume", "loadMoreJobs", "pollNow", "refreshNews"]);
    const fns = [...src.matchAll(/export async function (\w+)\([^)]*\)[^{]*\{([\s\S]*?)\n\}/g)];
    expect(fns.length).toBeGreaterThan(15);
    for (const [, name, body] of fns) {
      if (PUBLIC.has(name)) continue;
      expect(body, `${name} must call requireOwner()`).toMatch(/requireOwner\(\)/);
      expect(body.indexOf("requireOwner()"), `${name}: requireOwner() must come first`).toBeLessThan(80);
    }
  });
});
