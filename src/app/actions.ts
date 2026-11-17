"use server";
import { revalidatePath } from "next/cache";
import { discordConfigured, sendTelegram, telegramConfigured } from "@/alerts/channels";
import { logAlert, sendTestAlert } from "@/alerts/dispatch";
import { telegramJob } from "@/alerts/format";
import { canonicalSkill } from "@/lib/skills";
import { db, kvGet, kvSet } from "@/lib/db";
import { getJobs } from "@/lib/queries";
import type { JobFilters } from "@/lib/filters";
import { rescoreAll } from "@/lib/jobs";
import { companyKey } from "@/lib/normalize";
import { saveResume } from "@/lib/resume";
import { getProfile, getRules, setProfile, setRules, type AlertRules } from "@/lib/settings";
import { slugify } from "@/lib/text";
import { configFromUrl, discoverAts } from "@/sources/discover";

type Result = { ok: true; message?: string } | { ok: false; error: string };
const fail = (e: unknown): Result => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

function refreshAll() {
  revalidatePath("/", "layout");
}

// ── Job actions ─────────────────────────────────────────────────────────────
export async function starJob(id: string, starred: boolean): Promise<Result> {
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
  const c = await db();
  await c.execute({ sql: `UPDATE jobs SET dismissed = 0 WHERE id = ?`, args: [id] });
  refreshAll();
  return { ok: true };
}

export async function markApplied(id: string): Promise<Result> {
  const c = await db();
  const now = Date.now();
  await c.execute({ sql: `UPDATE jobs SET status = 'applied', starred = 1, applied_at = ?, status_at = ? WHERE id = ?`, args: [now, now, id] });
  refreshAll();
  return { ok: true, message: "Moved to Pipeline · Applied" };
}

export async function sendJobToTelegram(id: string): Promise<Result> {
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
  const { jobs } = await getJobs(filters, { offset, limit: 100 });
  return jobs;
}

// ── Polling ─────────────────────────────────────────────────────────────────
let polling: Promise<unknown> | null = null;

/** "Poll now": runs the worker in this server process (local / self-hosted). */
export async function pollNow(): Promise<Result> {
  if (process.env.VERCEL) {
    // hosted: the worker lives in GitHub Actions — trigger a run (fine-grained token with Actions: write)
    const token = process.env.GH_DISPATCH_TOKEN, repo = process.env.GH_REPO;
    if (!token || !repo) return { ok: false, error: "Polling runs on the GitHub Actions worker every 5 min (set GH_DISPATCH_TOKEN + GH_REPO to enable Poll now)" };
    const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/worker.yml/dispatches`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
      body: JSON.stringify({ ref: "main" }),
    });
    return r.status === 204 ? { ok: true, message: "Worker started on GitHub Actions — results in ~2 minutes" } : { ok: false, error: `GitHub returned ${r.status}` };
  }
  if (polling) return { ok: true, message: "A poll is already running" };
  const { runOnce } = await import("@/worker/run");
  polling = runOnce()
    .catch((e) => console.error("poll failed", e))
    .finally(() => {
      polling = null;
      refreshAll();
    });
  return { ok: true, message: "Polling all sources — results appear in about a minute" };
}

export async function markAlertsSeen(): Promise<void> {
  const c = await db();
  await c.execute(`UPDATE alerts SET seen = 1 WHERE seen = 0`);
  refreshAll();
}

// ── Settings: resume & skills ───────────────────────────────────────────────
export async function uploadResume(form: FormData): Promise<Result & { skills?: string[] }> {
  try {
    const file = form.get("file");
    const text = String(form.get("text") ?? "");
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
  const canon: string[] = [];
  const unknown: string[] = [];
  for (const s of skills) {
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
  const p = await setProfile({ ...(await getProfile()), levels: levels as any, regions: regions as any });
  await rescoreAll(p);
  refreshAll();
  return { ok: true };
}

// ── Settings: alerts ────────────────────────────────────────────────────────
export async function saveAlertRules(patch: Partial<AlertRules>): Promise<Result> {
  await setRules({ ...(await getRules()), ...patch });
  refreshAll();
  return { ok: true, message: "Alert rules saved" };
}

export async function testAlert(): Promise<Result> {
  const r = await sendTestAlert();
  if (r.channels.length) return { ok: true, message: `Test alert sent via ${r.channels.join(" + ")}` };
  return { ok: false, error: r.errors[0] ?? "No channel configured" };
}

export async function channelStatus() {
  return { telegram: telegramConfigured(), discord: discordConfigured() };
}

// ── Settings: add company ───────────────────────────────────────────────────
export async function addCompany(input: string): Promise<Result> {
  const raw = input.trim();
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
