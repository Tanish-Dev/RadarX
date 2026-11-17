/** Program page watcher: fetch → keyword lines → hash → alert on change (first fetch silent). */
import { createHash } from "node:crypto";
import pLimit from "p-limit";
import { ChannelError, discordConfigured, sendDiscord, sendTelegram, telegramConfigured } from "../alerts/channels";
import { logAlert } from "../alerts/dispatch";
import { escapeHtml } from "../alerts/format";
import { PROGRAMS } from "../data/programs";
import { db, kvGet, kvSet } from "../lib/db";
import { fetchText, HttpError } from "../lib/http";
import { extractDeadline, extractWatchLines } from "../lib/programs";
import { getRules, inQuietHours } from "../lib/settings";

const INTERVAL_MS = (Number(process.env.PROGRAM_INTERVAL_HOURS) || 6) * 3_600_000;

export interface ProgramCheck {
  id: string;
  ok: boolean;
  changed: boolean;
  seeded: boolean;
  lines: number;
  error?: string;
}

export async function checkPrograms(opts: { force?: boolean } = {}): Promise<ProgramCheck[] | null> {
  const now = Date.now();
  const last = (await kvGet<number>("programs_checked_at")) ?? 0;
  if (!opts.force && now - last < INTERVAL_MS) return null;
  await kvSet("programs_checked_at", now);

  const c = await db();
  const existing = new Map(
    (await c.execute(`SELECT id, hash, snippet FROM programs`)).rows.map((r) => [String(r.id), { hash: r.hash == null ? null : String(r.hash), snippet: String(r.snippet ?? "[]") }]),
  );
  const limit = pLimit(4);
  return Promise.all(
    PROGRAMS.filter((p) => p.watch).map((p) =>
      limit(async (): Promise<ProgramCheck> => {
        try {
          const html = await fetchText(p.url, { timeoutMs: 25_000 });
          const lines = extractWatchLines(html, p.keywords);
          const hash = createHash("sha1").update(lines.join("\n")).digest("hex");
          const prev = existing.get(p.id);
          const seeded = !prev?.hash;
          const changed = !seeded && prev!.hash !== hash;
          let added: string[] = [];
          if (changed) {
            const old = new Set((JSON.parse(prev!.snippet) as string[]).map((l) => l.toLowerCase()));
            added = lines.filter((l) => !old.has(l.toLowerCase())).slice(0, 8);
          }
          await c.execute({
            sql: `INSERT INTO programs (id, hash, snippet, status, last_checked, last_changed, last_error, deadline, pending_alert, changed_lines)
                  VALUES (?, ?, ?, 'ok', ?, ?, NULL, ?, 0, NULL)
                  ON CONFLICT(id) DO UPDATE SET hash = excluded.hash, snippet = excluded.snippet, status = 'ok', last_checked = excluded.last_checked,
                    last_error = NULL, deadline = excluded.deadline,
                    last_changed = CASE WHEN ? THEN excluded.last_checked ELSE programs.last_changed END,
                    pending_alert = CASE WHEN ? THEN 1 ELSE programs.pending_alert END,
                    changed_lines = CASE WHEN ? THEN ? ELSE programs.changed_lines END`,
            args: [p.id, hash, JSON.stringify(lines.slice(0, 120)), now, seeded ? null : now, extractDeadline(lines, now), changed ? 1 : 0, changed ? 1 : 0, changed ? 1 : 0, JSON.stringify(added)],
          });
          return { id: p.id, ok: true, changed, seeded, lines: lines.length };
        } catch (e) {
          const error = e instanceof HttpError ? `HTTP ${e.status}` : e instanceof Error ? (e.name === "AbortError" ? "timeout" : e.message) : String(e);
          await c.execute({
            sql: `INSERT INTO programs (id, status, last_checked, last_error) VALUES (?, 'error', ?, ?)
                  ON CONFLICT(id) DO UPDATE SET status = 'error', last_checked = excluded.last_checked, last_error = excluded.last_error`,
            args: [p.id, now, error],
          });
          return { id: p.id, ok: false, changed: false, seeded: false, lines: 0, error };
        }
      }),
    ),
  );
}

/** Telegram/Discord: "📚 <program> page updated" with the new lines. Held during quiet hours. */
export async function sendProgramAlerts(): Promise<number> {
  const tg = telegramConfigured(), dc = discordConfigured();
  if (!tg && !dc) return 0;
  const rules = await getRules();
  if (inQuietHours(rules.quietHours)) return 0;
  const c = await db();
  const pending = (await c.execute(`SELECT id, changed_lines, deadline FROM programs WHERE pending_alert = 1`)).rows;
  let sent = 0;
  for (const row of pending) {
    const p = PROGRAMS.find((x) => x.id === row.id);
    if (!p) continue;
    const added: string[] = JSON.parse(String(row.changed_lines ?? "[]"));
    const lines = added.slice(0, 4).map((l) => `• ${escapeHtml(l.length > 160 ? l.slice(0, 159) + "…" : l)}`).join("\n");
    const deadline = row.deadline ? `\n⏳ Deadline: ${new Date(Number(row.deadline)).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : "";
    const text = `📚 <b>${escapeHtml(p.name)}</b> — page updated\n🏛 ${escapeHtml(p.org)} · ${escapeHtml(p.country)}${deadline}${lines ? `\n\n${lines}` : ""}`;
    try {
      if (tg) await sendTelegram({ text, reply_markup: { inline_keyboard: [[{ text: "Open official page ↗", url: p.url }]] } });
      if (dc) await sendDiscord({ content: `📚 **${p.name}** — page updated\n${p.url}` });
      await logAlert(null, tg ? "telegram" : "discord", "program", `${p.name} — page updated`);
      await c.execute({ sql: `UPDATE programs SET pending_alert = 0 WHERE id = ?`, args: [p.id] });
      sent++;
    } catch (e) {
      if (e instanceof ChannelError && e.permanent) break;
    }
  }
  return sent;
}
