"use server";
import { revalidatePath, revalidateTag } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { OWNER_COOKIE, SESSION_DAYS, createSession, ownerPassword, passwordMatches, safeNext } from "@/lib/owner";
import { clientIp, coarseNet, enter, isSharedIp, rateLimit, refund, siteLoginFailures } from "@/lib/ratelimit";
import { isOwner, requireOwner } from "@/lib/viewer";
import { extractSkills } from "@/lib/skills";
import { sanitizeFilters } from "@/lib/filters";
import { getJobsFor } from "@/lib/jobsForViewer";
import { discordConfigured, sendTelegram, telegramConfigured } from "@/alerts/channels";
import { logAlert, sendTestAlert } from "@/alerts/dispatch";
import { telegramJob } from "@/alerts/format";
import { canonicalSkill } from "@/lib/skills";
import { db, kvGet, kvSet } from "@/lib/db";
import type { JobFilters } from "@/lib/filters";
import { rescoreAll } from "@/lib/jobs";
import { companyKey } from "@/lib/normalize";
import { ResumeError, VISITOR_RESUME_BYTES, readResumeFile, saveResume } from "@/lib/resume";
import { getProfile, getRules, setProfile, setRules, type AlertRules } from "@/lib/settings";
import { slugify } from "@/lib/text";
import { configFromUrl, discoverAts } from "@/sources/discover";

type Result = { ok: true; message?: string } | { ok: false; error: string };
const fail = (e: unknown): Result => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

function refreshAll() {
  revalidateTag("db"); // cached reads (src/lib/cache.ts)
  revalidatePath("/", "layout");
}

const ID_RE = /^[\w.:\-]{1,200}$/;
const badId = (id: unknown) => typeof id !== "string" || !ID_RE.test(id);

// ── Owner sign-in ───────────────────────────────────────────────────────────
export async function login(_prev: { error?: string } | null, form: FormData): Promise<{ error?: string }> {
  const ip = clientIp(await headers());
  // Layered, so neither guessing nor lockout spam wins. Hard refusals only ever hit the attacker's own address or
  // network; everything site-wide is a slow-down, never a refusal, so nobody can lock the owner out:
  //  1. each attempt is counted BEFORE the password check and refunded only if it was right (no parallel race):
  //     5 failures / 15 min per client IP, 100 per network (IPv4 /16, IPv6 /48);
  //  2. at most 4 password checks run at once per network — the slot covers only the check, not the delay;
  //  3. site-wide failures (a botnet spread over many networks) stretch every attempt from 0.4 s up to 10 s.
  //  With no trusted client IP (self-hosted without TRUSTED_PROXY_HOPS) only the slow-down applies.
  // With a long random OWNER_PASSWORD, even an unthrottled botnet couldn't guess it; these layers keep it cheap.
  const shared = isSharedIp(ip);
  const net = shared ? "shared" : coarseNet(ip);
  const reserved: string[] = [];
  const reserve = (key: string, max: number) => {
    const r = rateLimit(key, max, 15 * 60_000);
    reserved.push(key);
    return r;
  };
  const giveBack = () => reserved.forEach(refund);
  if (!shared) {
    const mine = reserve(`login-fail:${ip}`, 5);
    const network = reserve(`login-fail:net:${net}`, 100);
    if (!mine.ok || !network.ok) {
      giveBack();
      return { error: `Too many attempts — try again in ${Math.ceil(Math.max(mine.retryAfterS, network.retryAfterS) / 60)} min.` };
    }
  }
  reserve("login-fail:*", 1e9); // site-wide failure count: drives the slow-down only
  const siteFails = siteLoginFailures();
  if (!ownerPassword()) return (giveBack(), { error: "Owner sign-in isn't set up on this deployment (OWNER_PASSWORD)." });
  const leave = enter(`login:${net}`, 4);
  if (!leave) return (giveBack(), { error: "Sign-in is busy — try again in a moment." });
  let ok = false;
  try {
    ok = await passwordMatches(String(form.get("password") ?? ""));
  } finally {
    leave();
  }
  const slow = Math.min(10_000, 400 * 2 ** Math.max(0, Math.floor(siteFails / 30)));
  await new Promise((r) => setTimeout(r, slow + Math.random() * 400)); // flatten timing, slow guessing
  if (!ok) return { error: "Wrong password." };
  giveBack();
  const session = await createSession();
  (await cookies()).set(OWNER_COOKIE, session!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
  refreshAll();
  redirect(safeNext(form.get("next")));
}

export async function logout(): Promise<void> {
  (await cookies()).delete(OWNER_COOKIE);
  refreshAll();
  redirect("/");
}

// ── Visitor: skills from pasted text (nothing is stored server-side) ────────
export async function extractVisitorSkills(text: string): Promise<Result & { skills?: string[] }> {
  const ip = clientIp(await headers());
  if (!rateLimit(`skills:${ip}`, 20, 10 * 60_000).ok || !rateLimit("skills:*", 600, 10 * 60_000).ok) return { ok: false, error: "Too many requests — try again in a few minutes." };
  if (typeof text !== "string" || !text.trim()) return { ok: false, error: "Paste your resume text or a list of skills." };
  const skills = extractSkills(text.slice(0, 30_000)).slice(0, 40);
  return skills.length ? { ok: true, skills } : { ok: false, error: "No skills recognised — try listing them, e.g. “Python, React, SQL”." };
}

/**
 * Visitor: read skills from an uploaded resume (PDF or text). One-shot — the file is parsed in memory and dropped;
 * only the recognised skill names go back to the browser. Guarded against hostile files: size + page caps, a
 * %PDF magic-byte check, a parse timeout, and per-IP + site-wide rate limits so it can't be used to burn CPU.
 */
export async function extractVisitorResume(form: FormData): Promise<Result & { skills?: string[] }> {
  const ip = clientIp(await headers());
  if (!rateLimit(`resume:${ip}`, 6, 10 * 60_000).ok || !rateLimit("resume:*", 60, 10 * 60_000).ok)
    return { ok: false, error: "Too many uploads — try again in a few minutes." };
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a PDF or .txt resume." };
  if (file.size > VISITOR_RESUME_BYTES) return { ok: false, error: "That file is over 3 MB — export a smaller PDF or paste the text." };
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    const text = await readResumeFile(buf, file.name, { deadlineMs: 8_000 });
    const skills = extractSkills(text.slice(0, 50_000)).slice(0, 40);
    return skills.length ? { ok: true, skills } : { ok: false, error: "No skills recognised in that file — try pasting the text." };
  } catch (e) {
    return { ok: false, error: e instanceof ResumeError ? e.message : "Couldn't read that file — try another PDF or paste the text." };
  }
}

// ── Job actions ─────────────────────────────────────────────────────────────
export async function starJob(id: string, starred: boolean): Promise<Result> {
  const deny = await requireOwner();
  if (deny) return deny;
  if (badId(id)) return { ok: false, error: "Invalid posting id" };
  const c = await db();
  await c.execute({
    sql: `UPDATE jobs SET starred = ?, status = CASE WHEN ? = 1 AND status IS NULL THEN 'saved' WHEN ? = 0 AND status = 'saved' THEN NULL ELSE status END,
            status_at = ? WHERE id = ?`,
    args: [starred ? 1 : 0, starred ? 1 : 0, starred ? 1 : 0, Date.now(), id],
  });
  refreshAll();
  return { ok: true };
}

export async function dismissJob(id: string, hideCompany = false): Promise<Result> {
  const deny = await requireOwner();
  if (deny) return deny;
  if (badId(id)) return { ok: false, error: "Invalid posting id" };
  const c = await db();
  await c.execute({ sql: `UPDATE jobs SET dismissed = 1 WHERE id = ?`, args: [id] });
  if (hideCompany) {
    const r = await c.execute({ sql: `SELECT company_key FROM jobs WHERE id = ?`, args: [id] });
    const key = r.rows[0]?.company_key;
    if (key) {
      const hidden = (await kvGet<string[]>("hidden_companies")) ?? [];
      if (!hidden.includes(String(key))) await kvSet("hidden_companies", [...hidden, String(key)]);
    }
  }
  refreshAll();
  return { ok: true };
}

export async function undismissJob(id: string): Promise<Result> {
  const deny = await requireOwner();
  if (deny) return deny;
  if (badId(id)) return { ok: false, error: "Invalid posting id" };
  const c = await db();
  await c.execute({ sql: `UPDATE jobs SET dismissed = 0 WHERE id = ?`, args: [id] });
  refreshAll();
  return { ok: true };
}

export async function markApplied(id: string): Promise<Result> {
  const deny = await requireOwner();
  if (deny) return deny;
  if (badId(id)) return { ok: false, error: "Invalid posting id" };
  const c = await db();
  const now = Date.now();
  await c.execute({ sql: `UPDATE jobs SET status = 'applied', starred = 1, applied_at = ?, status_at = ? WHERE id = ?`, args: [now, now, id] });
  refreshAll();
  return { ok: true, message: "Moved to Pipeline · Applied" };
}

export async function sendJobToTelegram(id: string): Promise<Result> {
  const deny = await requireOwner();
  if (deny) return deny;
  if (badId(id)) return { ok: false, error: "Invalid posting id" };
  if (!telegramConfigured()) return { ok: false, error: "Telegram isn't connected — see Settings" };
  try {
    const c = await db();
    const r: any = (await c.execute({ sql: `SELECT * FROM jobs WHERE id = ?`, args: [id] })).rows[0];
    if (!r) return { ok: false, error: "Posting not found" };
    const job = {
      ...r,
      score: r.score == null ? null : Number(r.score),
      posted_at: r.posted_at == null ? null : Number(r.posted_at),
      first_seen_at: Number(r.first_seen_at),
      skills: JSON.parse(String(r.skills ?? "[]")),
    };
    await sendTelegram(telegramJob(job));
    await logAlert(id, "telegram", "manual", `${r.title} — ${r.company}`);
    return { ok: true, message: "Sent to Telegram" };
  } catch (e) {
    return fail(e);
  }
}

/** Infinite scroll on the Feed. */
export async function loadMoreJobs(filters: Partial<JobFilters>, offset: number) {
  const ip = clientIp(await headers());
  if (!rateLimit(`more:${ip}`, 60, 60_000).ok || !rateLimit("more:*", 1200, 60_000).ok) return [];
  const off = Number.isFinite(offset) ? Math.max(0, Math.min(5_000, Math.floor(offset))) : 0;
  const { jobs } = await getJobsFor(sanitizeFilters(filters), { offset: off, limit: 100 });
  return jobs;
}

// ── Polling ─────────────────────────────────────────────────────────────────
let polling: Promise<unknown> | null = null;

/**
 * Anyone can ask for a fresh check, but the whole site shares one cooldown (kept in the DB, so it holds across
 * serverless instances): at most one worker run per POLL_GAP_MS for visitors, so a crowd — or a script — can't
 * hammer the company job boards (which would get RadarX rate-limited or blocked) or spam GitHub with our token.
 */
const POLL_GAP_MS = 5 * 60_000;
const OWNER_POLL_GAP_MS = 60_000;

async function lastPollAt(): Promise<number> {
  const c = await db();
  const r = await c.execute(`SELECT MAX(started_at) AS t FROM runs`);
  return Math.max(Number(r.rows[0]?.t ?? 0), (await kvGet<number>("poll_requested_at")) ?? 0);
}

/** "Check now": triggers the worker (GitHub Actions when hosted, in-process locally). */
export async function pollNow(): Promise<Result> {
  // public on purpose — guarded by the shared cooldown + per-IP limit below, and it takes no input
  const owner = await isOwner();
  const ip = clientIp(await headers());
  if (!owner && (!rateLimit(`poll:${ip}`, 4, 10 * 60_000).ok || !rateLimit("poll:*", 200, 10 * 60_000).ok)) return { ok: false, error: "Slow down — try again in a few minutes." };
  const gap = owner ? OWNER_POLL_GAP_MS : POLL_GAP_MS;
  const since = Date.now() - (await lastPollAt());
  if (since < gap) {
    const wait = Math.ceil((gap - since) / 60_000);
    return { ok: true, message: `Checked ${Math.max(0, Math.round(since / 60_000))} min ago — next check available in ${wait} min` };
  }
  await kvSet("poll_requested_at", Date.now());
  if (process.env.VERCEL) {
    // hosted: the worker lives in GitHub Actions — trigger a run (fine-grained token with Actions: write)
    const token = process.env.GH_DISPATCH_TOKEN, repo = process.env.GH_REPO;
    if (!token || !repo) return { ok: true, message: "Sources are checked automatically every 5 minutes" };
    const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/worker.yml/dispatches`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
      body: JSON.stringify({ ref: "main" }),
    });
    if (r.status === 204) return { ok: true, message: "Checking every source now — new roles appear in ~2 minutes" };
    console.error("workflow dispatch failed", r.status);
    return { ok: false, error: owner ? `GitHub returned ${r.status}` : "Couldn't start a check — sources are still checked every 5 minutes" };
  }
  if (polling) return { ok: true, message: "A check is already running" };
  const { runOnce } = await import("@/worker/run");
  polling = runOnce()
    .catch((e) => console.error("poll failed", e))
    .finally(() => {
      polling = null;
      refreshAll();
    });
  return { ok: true, message: "Checking every source — results appear in about a minute" };
}

/**
 * Pull the news feeds from the dashboard itself (no worker needed): the page calls this when its stories are
 * older than the poll interval, and from the Refresh button. Public, with a site-wide gap (stored in the DB by
 * checkNews) so all visitors together fetch the feeds at most once per gap — publishers see one polite client.
 */
export async function refreshNews(): Promise<Result & { fetched?: number; checkedAt?: number }> {
  const owner = await isOwner();
  const ip = clientIp(await headers());
  if (!owner && (!rateLimit(`news:${ip}`, 10, 10 * 60_000).ok || !rateLimit("news:*", 300, 10 * 60_000).ok)) return { ok: false, error: "Slow down — try again in a few minutes." };
  try {
    const { checkNews } = await import("@/worker/news");
    const rows = await checkNews({ minGapMs: owner ? 2 * 60_000 : 10 * 60_000 });
    const checkedAt = (await kvGet<number>("news_checked_at")) ?? Date.now();
    if (!rows) return { ok: true, message: "Already up to date", checkedAt };
    refreshAll();
    return { ok: true, fetched: rows.reduce((n, r) => n + r.added, 0), checkedAt };
  } catch (e) {
    return fail(e);
  }
}

export async function markAlertsSeen(): Promise<void> {
  if (await requireOwner()) return;
  const c = await db();
  await c.execute(`UPDATE alerts SET seen = 1 WHERE seen = 0`);
  refreshAll();
}

// ── Settings: resume & skills ───────────────────────────────────────────────
export async function uploadResume(form: FormData): Promise<Result & { skills?: string[] }> {
  const deny = await requireOwner();
  if (deny) return deny;
  try {
    const file = form.get("file");
    const text = String(form.get("text") ?? "").slice(0, 100_000);
    let p;
    if (file instanceof File && file.size > 0) {
      if (file.size > 5_000_000) return { ok: false, error: "PDF is larger than 5 MB" };
      const buf = new Uint8Array(await file.arrayBuffer());
      p = file.name.toLowerCase().endsWith(".pdf") ? await saveResume({ pdf: buf }) : await saveResume({ text: new TextDecoder().decode(buf) });
    } else if (text.trim()) {
      p = await saveResume({ text });
    } else {
      return { ok: false, error: "Choose a PDF or paste your resume text" };
    }
    if (!p.skills.length) return { ok: false, error: "No skills recognised — try pasting the text instead" };
    await rescoreAll(p);
    refreshAll();
    return { ok: true, skills: p.skills, message: `Found ${p.skills.length} skills · rescored every posting` };
  } catch (e) {
    return fail(e);
  }
}

export async function updateSkills(skills: string[]): Promise<Result & { skills?: string[]; unknown?: string[] }> {
  const deny = await requireOwner();
  if (deny) return deny;
  if (!Array.isArray(skills)) return { ok: false, error: "Invalid skills" };
  const canon: string[] = [];
  const unknown: string[] = [];
  for (const s of skills.filter((x): x is string => typeof x === "string" && x.length <= 60).slice(0, 80)) {
    const k = canonicalSkill(s);
    if (k) {
      if (!canon.includes(k)) canon.push(k);
    } else unknown.push(s);
  }
  const p = await setProfile({ ...(await getProfile()), skills: canon });
  await rescoreAll(p);
  refreshAll();
  return { ok: true, skills: canon, unknown };
}

export async function updatePreferences(levels: string[], regions: string[]): Promise<Result> {
  const deny = await requireOwner();
  if (deny) return deny;
  const L = ["intern", "newgrad", "research", "experienced"], R = ["india", "remote", "global"];
  if (!Array.isArray(levels) || !Array.isArray(regions)) return { ok: false, error: "Invalid preferences" };
  const p = await setProfile({ ...(await getProfile()), levels: levels.filter((x) => L.includes(x)) as any, regions: regions.filter((x) => R.includes(x)) as any });
  await rescoreAll(p);
  refreshAll();
  return { ok: true };
}

// ── Settings: alerts ────────────────────────────────────────────────────────
export async function saveAlertRules(patch: Partial<AlertRules>): Promise<Result> {
  const deny = await requireOwner();
  if (deny) return deny;
  await setRules(cleanRules(await getRules(), patch));
  refreshAll();
  return { ok: true, message: "Alert rules saved" };
}

/** Accept only known alert-rule fields with the right types (defense in depth — the client is never trusted). */
function cleanRules(cur: AlertRules, p: Partial<AlertRules>): AlertRules {
  const out = { ...cur };
  if (!p || typeof p !== "object") return out;
  const L = ["intern", "newgrad", "research", "experienced"], R = ["india", "remote", "global"];
  if (Array.isArray(p.levels)) out.levels = p.levels.filter((x) => L.includes(x)) as AlertRules["levels"];
  if (Array.isArray(p.regions)) out.regions = p.regions.filter((x) => R.includes(x)) as AlertRules["regions"];
  if (typeof p.techOnly === "boolean") out.techOnly = p.techOnly;
  if (Number.isFinite(p.minScore)) out.minScore = Math.max(0, Math.min(100, Math.round(p.minScore!)));
  if (Number.isFinite(p.maxPerRun)) out.maxPerRun = Math.max(1, Math.min(50, Math.round(p.maxPerRun!)));
  const hhmm = (v: unknown) => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  if (p.quietHours && typeof p.quietHours === "object") {
    out.quietHours = {
      enabled: typeof p.quietHours.enabled === "boolean" ? p.quietHours.enabled : cur.quietHours.enabled,
      start: hhmm(p.quietHours.start) ? p.quietHours.start : cur.quietHours.start,
      end: hhmm(p.quietHours.end) ? p.quietHours.end : cur.quietHours.end,
    };
  }
  if (p.channels && typeof p.channels === "object") {
    out.channels = { telegram: typeof p.channels.telegram === "boolean" ? p.channels.telegram : cur.channels.telegram, discord: typeof p.channels.discord === "boolean" ? p.channels.discord : cur.channels.discord };
  }
  return out;
}

export async function testAlert(): Promise<Result> {
  const deny = await requireOwner();
  if (deny) return deny;
  const r = await sendTestAlert();
  if (r.channels.length) return { ok: true, message: `Test alert sent via ${r.channels.join(" + ")}` };
  return { ok: false, error: r.errors[0] ?? "No channel configured" };
}

export async function channelStatus() {
  if (await requireOwner()) return { telegram: false, discord: false };
  return { telegram: telegramConfigured(), discord: discordConfigured() };
}

// ── Settings: add company ───────────────────────────────────────────────────
export async function addCompany(input: string): Promise<Result> {
  const deny = await requireOwner();
  if (deny) return deny;
  const raw = typeof input === "string" ? input.trim().slice(0, 300) : "";
  if (!raw) return { ok: false, error: "Type a company name or paste a careers URL" };
  const c = await db();
  try {
    let name = raw;
    let config = configFromUrl(raw);
    let domain: string | null = null;
    if (/^https?:\/\//i.test(raw)) {
      if (!config) return { ok: false, error: "Couldn't recognise that careers URL (Greenhouse, Lever, Ashby, SmartRecruiters, Workday, Oracle supported)" };
      const u = new URL(raw);
      name = "slug" in config ? config.slug : "tenant" in config ? config.tenant : u.hostname;
      name = name.charAt(0).toUpperCase() + name.slice(1);
    } else {
      const d = await discoverAts(raw);
      config = d.config;
      if (!config) return { ok: false, error: `No Greenhouse/Lever/Ashby/SmartRecruiters board found for "${raw}" — paste its careers URL instead` };
      domain = `${companyKey(raw).replace(/-/g, "")}.com`;
    }
    const key = slugify(name);
    await c.execute({
      sql: `INSERT INTO sources (key, name, kind, domain, config, status, added_by, last_discovery) VALUES (?, ?, 'explicit', ?, ?, 'ready', 'user', ?)
            ON CONFLICT(key) DO UPDATE SET config = excluded.config, status = 'ready', last_error = NULL`,
      args: [key, name, domain, JSON.stringify(config), Date.now()],
    });
    refreshAll();
    return { ok: true, message: `Added ${name} (${config!.ats}). Its current postings are stored silently on the next poll; new ones will alert.` };
  } catch (e) {
    return fail(e);
  }
}

export async function setStage(id: string, stage: "saved" | "applied" | "interview" | "offer" | "rejected" | null): Promise<Result> {
  const deny = await requireOwner();
  if (deny) return deny;
  if (badId(id)) return { ok: false, error: "Invalid posting id" };
  if (stage !== null && !["saved", "applied", "interview", "offer", "rejected"].includes(stage)) return { ok: false, error: "Invalid stage" };
  const c = await db();
  const now = Date.now();
  if (stage === null) {
    await c.execute({ sql: `UPDATE jobs SET status = NULL, starred = 0, status_at = ? WHERE id = ?`, args: [now, id] });
  } else {
    await c.execute({
      sql: `UPDATE jobs SET status = ?, starred = 1, status_at = ?, applied_at = CASE WHEN ? IN ('applied','interview','offer','rejected') THEN COALESCE(applied_at, ?) ELSE applied_at END WHERE id = ?`,
      args: [stage, now, stage, now, id],
    });
  }
  refreshAll();
  return { ok: true };
}
