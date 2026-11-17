/** End-to-end alert dispatch against a throwaway libSQL file with a mocked Telegram API. */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const dir = mkdtempSync(join(tmpdir(), "radarx-test-"));
process.env.DATABASE_URL = `file:${join(dir, "test.db")}`;
process.env.TELEGRAM_BOT_TOKEN = "TEST";
process.env.TELEGRAM_CHAT_ID = "42";
delete process.env.DISCORD_WEBHOOK_URL;

const { db } = await import("../src/lib/db");
const { setRules, DEFAULT_RULES } = await import("../src/lib/settings");
const { dispatchAlerts } = await import("../src/alerts/dispatch");
const { dedupeKey } = await import("../src/lib/normalize");

const NOW = Date.UTC(2026, 10, 17, 6, 0); // 11:30 IST
let sent: any[] = [];
let fail429Once = false;

function mockTelegram() {
  vi.stubGlobal("fetch", async (url: string, init: any) => {
    if (!String(url).startsWith("https://api.telegram.org/")) throw new Error("unexpected fetch " + url);
    if (fail429Once) {
      fail429Once = false;
      return new Response(JSON.stringify({ ok: false, parameters: { retry_after: 0 } }), { status: 429 });
    }
    sent.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
  });
}

let n = 0;
async function addJob(p: Partial<{ source: string; title: string; company: string; location: string; level: string; region: string; is_tech: number; score: number | null; first_seen_at: number; notified: number }>) {
  const c = await db();
  const j = { source: "stripe", title: "Software Engineer Intern", company: "Stripe", location: "Bengaluru, India", level: "intern", region: "india", is_tech: 1, score: null, first_seen_at: NOW - 60_000, notified: 0, ...p };
  const id = `${j.source}:${++n}`;
  await c.execute({
    sql: `INSERT INTO jobs (id, source, company_key, company, title, location, url, posted_at, first_seen_at, last_seen_at, level, region, is_tech, score, notified, dedupe_key, classifier_version)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    args: [id, j.source, j.company.toLowerCase(), j.company, j.title, j.location, `https://example.com/${n}`, NOW - 120_000, j.first_seen_at, NOW, j.level, j.region, j.is_tech, j.score, j.notified, dedupeKey(j.company, j.title, j.location)],
  });
  return id;
}

const status = async (id: string) =>
  String((await (await db()).execute({ sql: `SELECT alert_status FROM jobs WHERE id = ?`, args: [id] })).rows[0].alert_status);

beforeAll(async () => {
  await db();
});
beforeEach(async () => {
  sent = [];
  await (await db()).execute(`DELETE FROM jobs`);
  await setRules({ ...DEFAULT_RULES });
  mockTelegram();
});
afterEach(() => vi.unstubAllGlobals());

describe("dispatchAlerts", () => {
  it("sends matching postings and filters the rest by rules", async () => {
    const ok = await addJob({});
    const sales = await addJob({ title: "Account Executive", is_tech: 0 });
    const senior = await addJob({ title: "Senior Engineer", level: "experienced" });
    const r = await dispatchAlerts(NOW);
    expect(r.sent).toBe(1);
    expect(r.filtered).toBe(2);
    expect(await status(ok)).toBe("sent");
    expect(await status(sales)).toBe("filtered");
    expect(await status(senior)).toBe("filtered");
    expect(sent[0].text).toContain("<b>Software Engineer Intern</b>");
    expect(sent[0].reply_markup.inline_keyboard[0][0]).toMatchObject({ text: "Apply ↗", url: expect.stringContaining("example.com") });
    expect(sent[0].parse_mode).toBe("HTML");
  });

  it("dedupes the same role from Simplify and the company ATS, preferring the direct link", async () => {
    const simplify = await addJob({ source: "simplify-summer2027-internships" });
    const direct = await addJob({ source: "stripe" });
    const r = await dispatchAlerts(NOW);
    expect(r.sent).toBe(1);
    expect(r.dup).toBe(1);
    expect(await status(direct)).toBe("sent");
    expect(await status(simplify)).toBe("dup");
  });

  it("doesn't re-alert a role that already existed (e.g. seeded earlier)", async () => {
    await addJob({ first_seen_at: NOW - 86_400_000 * 3, notified: 1 });
    const again = await addJob({ source: "simplify-summer2027-internships" });
    await dispatchAlerts(NOW);
    expect(await status(again)).toBe("dup");
    expect(sent).toHaveLength(0);
  });

  it("caps individual messages and sends the overflow as one summary, best matches first", async () => {
    await setRules({ maxPerRun: 2 });
    for (let i = 0; i < 5; i++) await addJob({ title: `ML Intern ${"abcde"[i]}`, score: 50 + i * 10 });
    const r = await dispatchAlerts(NOW);
    expect(r.sent).toBe(2);
    expect(r.overflow).toBe(3);
    expect(sent).toHaveLength(3);
    expect(sent[0].text).toContain("ML Intern e"); // score 90 first
    expect(sent[1].text).toContain("ML Intern d");
    expect(sent[2].text).toContain("+3 more new postings");
  });

  it("applies the minimum match % once scores exist", async () => {
    await setRules({ minScore: 60 });
    const low = await addJob({ score: 40 });
    const high = await addJob({ title: "Data Intern", score: 75 });
    const unscored = await addJob({ title: "Backend Intern", score: null });
    await dispatchAlerts(NOW);
    expect(await status(low)).toBe("filtered");
    expect(await status(high)).toBe("sent");
    expect(await status(unscored)).toBe("sent");
  });

  it("holds alerts during quiet hours and sends them afterwards", async () => {
    await setRules({ quietHours: { enabled: true, start: "11:00", end: "12:00" } }); // NOW = 11:30 IST
    const id = await addJob({});
    const r1 = await dispatchAlerts(NOW);
    expect(r1).toMatchObject({ sent: 0, held: 1, heldReason: "quiet-hours" });
    expect(sent).toHaveLength(0);
    const r2 = await dispatchAlerts(NOW + 45 * 60_000);
    expect(r2.sent).toBe(1);
    expect(await status(id)).toBe("sent");
  });

  it("retries after a Telegram 429", async () => {
    fail429Once = true;
    await addJob({});
    const r = await dispatchAlerts(NOW);
    expect(r.sent).toBe(1);
    expect(sent).toHaveLength(1);
  });

  it("expires postings that waited more than 24h", async () => {
    const old = await addJob({ first_seen_at: NOW - 25 * 3_600_000 });
    const r = await dispatchAlerts(NOW);
    expect(r.expired).toBe(1);
    expect(await status(old)).toBe("expired");
  });
});
