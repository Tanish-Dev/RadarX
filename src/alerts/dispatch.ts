import { isAggregateSource } from "../data/companies";
import { db } from "../lib/db";
import { getRules, inQuietHours, type AlertRules } from "../lib/settings";
import { ChannelError, discordConfigured, sendDiscord, sendTelegram, telegramConfigured } from "./channels";
import { discordJob, discordSummary, plainLine, telegramJob, telegramSummary, type AlertJob } from "./format";

export interface DispatchResult {
  sent: number;
  overflow: number;
  filtered: number;
  dup: number;
  expired: number;
  /** waiting because of quiet hours or no channel configured */
  held: number;
  heldReason?: "quiet-hours" | "no-channel";
  channels: string[];
  errors: string[];
}

/** Pending alerts older than this are dropped (e.g. the worker was off for a day). */
const PENDING_TTL_MS = 24 * 3_600_000;

interface PendingRow extends AlertJob {
  source: string;
  is_tech: number;
  dedupe_key: string;
}

export function passesRules(j: Pick<PendingRow, "is_tech" | "level" | "region" | "score">, rules: AlertRules): boolean {
  if (rules.techOnly && Number(j.is_tech) !== 1) return false;
  if (j.level && !rules.levels.includes(j.level as any)) return false;
  if (j.region && !rules.regions.includes(j.region as any)) return false;
  if (rules.minScore > 0 && j.score != null && j.score < rules.minScore) return false;
  return true;
}

const isAggregate = isAggregateSource;

/** Prefer the direct company ATS link over the aggregate list; then the earliest seen. */
function pickPreferred(group: PendingRow[]): PendingRow {
  return [...group].sort((a, b) => Number(isAggregate(a.source)) - Number(isAggregate(b.source)) || a.first_seen_at - b.first_seen_at)[0];
}

/** Highest match first, then freshest. */
function rank(a: PendingRow, b: PendingRow) {
  return (b.score ?? -1) - (a.score ?? -1) || (b.posted_at ?? b.first_seen_at) - (a.posted_at ?? a.first_seen_at);
}

export async function dispatchAlerts(now = Date.now()): Promise<DispatchResult> {
  const c = await db();
  const rules = await getRules();
  const useTg = rules.channels.telegram && telegramConfigured();
  const useDc = rules.channels.discord && discordConfigured();
  const res: DispatchResult = { sent: 0, overflow: 0, filtered: 0, dup: 0, expired: 0, held: 0, channels: [], errors: [] };
  if (useTg) res.channels.push("telegram");
  if (useDc) res.channels.push("discord");

  const exp = await c.execute({
    sql: `UPDATE jobs SET notified = 1, alert_status = 'expired' WHERE notified = 0 AND first_seen_at < ?`,
    args: [now - PENDING_TTL_MS],
  });
  res.expired = exp.rowsAffected;

  const r = await c.execute(
    `SELECT id, source, title, company, location, url, level, region, score, posted_at, first_seen_at, is_tech, dedupe_key, skills
     FROM jobs WHERE notified = 0 AND active = 1`,
  );
  const pending: PendingRow[] = r.rows.map((x: any) => ({
    ...x,
    score: x.score == null ? null : Number(x.score),
    posted_at: x.posted_at == null ? null : Number(x.posted_at),
    first_seen_at: Number(x.first_seen_at),
    skills: JSON.parse(String(x.skills ?? "[]")),
  }));
  if (!pending.length) return res;

  const mark = async (ids: string[], status: string, alertedAt: number | null = null) => {
    if (!ids.length) return;
    await c.batch(
      ids.map((id) => ({ sql: `UPDATE jobs SET notified = 1, alert_status = ?, alerted_at = ? WHERE id = ?`, args: [status, alertedAt, id] })),
      "write",
    );
  };

  // 1) rules
  const filtered = pending.filter((j) => !passesRules(j, rules));
  await mark(filtered.map((j) => j.id), "filtered");
  res.filtered = filtered.length;
  let candidates = pending.filter((j) => passesRules(j, rules));

  // 2) dedupe: same role seen earlier (any source) or already alerted → skip
  const dups: string[] = [];
  const fresh: PendingRow[] = [];
  for (const j of candidates) {
    const prior = await c.execute({
      sql: `SELECT 1 FROM jobs WHERE dedupe_key = ? AND id != ? AND (first_seen_at < ? OR alert_status IN ('sent','overflow')) LIMIT 1`,
      args: [j.dedupe_key, j.id, j.first_seen_at],
    });
    if (prior.rows.length) dups.push(j.id);
    else fresh.push(j);
  }
  //    …and within this batch keep one per dedupe_key
  const groups = new Map<string, PendingRow[]>();
  for (const j of fresh) groups.set(j.dedupe_key, [...(groups.get(j.dedupe_key) ?? []), j]);
  candidates = [];
  for (const g of groups.values()) {
    const keep = pickPreferred(g);
    candidates.push(keep);
    dups.push(...g.filter((x) => x !== keep).map((x) => x.id));
  }
  await mark(dups, "dup");
  res.dup = dups.length;
  if (!candidates.length) return res;

  // 3) hold when nowhere to send or during quiet hours (stays pending, sent later)
  if (!useTg && !useDc) {
    res.held = candidates.length;
    res.heldReason = "no-channel";
    return res;
  }
  if (inQuietHours(rules.quietHours, now)) {
    res.held = candidates.length;
    res.heldReason = "quiet-hours";
    return res;
  }

  // 4) send top N individually, the rest as one summary
  candidates.sort(rank);
  const top = candidates.slice(0, Math.max(0, rules.maxPerRun));
  const rest = candidates.slice(top.length);
  let tgDead = !useTg, dcDead = !useDc;

  for (const j of top) {
    let delivered = false;
    if (!tgDead) {
      try {
        await sendTelegram(telegramJob(j, now));
        delivered = true;
        await logAlert(j.id, "telegram", "job", plainLine(j));
      } catch (e) {
        res.errors.push((e as Error).message);
        if (e instanceof ChannelError && e.permanent) tgDead = true;
      }
    }
    if (!dcDead) {
      try {
        await sendDiscord(discordJob(j, now));
        delivered = true;
        if (tgDead) await logAlert(j.id, "discord", "job", plainLine(j));
      } catch (e) {
        res.errors.push((e as Error).message);
        if (e instanceof ChannelError && e.permanent) dcDead = true;
      }
    }
    if (!delivered) break; // leave the rest pending; retry next run
    await mark([j.id], "sent", Date.now());
    res.sent++;
  }

  if (rest.length && res.sent === top.length) {
    const counts: Record<string, number> = {};
    for (const j of rest) counts[j.level ?? "other"] = (counts[j.level ?? "other"] ?? 0) + 1;
    let delivered = false;
    if (!tgDead) {
      try {
        await sendTelegram(telegramSummary(rest, counts));
        delivered = true;
      } catch (e) {
        res.errors.push((e as Error).message);
      }
    }
    if (!dcDead) {
      try {
        await sendDiscord(discordSummary(rest));
        delivered = true;
      } catch (e) {
        res.errors.push((e as Error).message);
      }
    }
    if (delivered) {
      await mark(rest.map((j) => j.id), "overflow", Date.now());
      await logAlert(null, tgDead ? "discord" : "telegram", "summary", `+${rest.length} more new postings`);
      res.overflow = rest.length;
    }
  }
  return res;
}

export async function logAlert(jobId: string | null, channel: string, kind: string, text: string) {
  const c = await db();
  await c.execute({
    sql: `INSERT INTO alerts (job_id, channel, kind, text, sent_at) VALUES (?, ?, ?, ?, ?)`,
    args: [jobId, channel, kind, text, Date.now()],
  });
}

/** "Send test alert" — uses the best recent real posting if there is one. */
export async function sendTestAlert(): Promise<{ channels: string[]; errors: string[] }> {
  const c = await db();
  const r = await c.execute(
    `SELECT id, title, company, location, url, level, region, score, posted_at, first_seen_at, skills FROM jobs
     WHERE active = 1 AND is_tech = 1 AND level IN ('intern','newgrad','research')
     ORDER BY COALESCE(score, -1) DESC, COALESCE(posted_at, first_seen_at) DESC LIMIT 1`,
  );
  const row: any = r.rows[0];
  const job: AlertJob = row
    ? { ...row, score: row.score == null ? null : Number(row.score), posted_at: row.posted_at == null ? null : Number(row.posted_at), first_seen_at: Number(row.first_seen_at), skills: JSON.parse(String(row.skills ?? "[]")) }
    : { id: "test", title: "Machine Learning Intern (test)", company: "RadarX", location: "Pune, India", url: "https://example.com", level: "intern", region: "india", score: 87, posted_at: Date.now() - 4 * 60_000, first_seen_at: Date.now(), skills: ["Python", "PyTorch"] };
  const out = { channels: [] as string[], errors: [] as string[] };
  const header = { text: "🧪 <b>RadarX test alert</b> — this is what a new posting looks like:" };
  if (telegramConfigured()) {
    try {
      await sendTelegram(header);
      await sendTelegram(telegramJob(job));
      out.channels.push("telegram");
      await logAlert(null, "telegram", "test", "Test alert");
    } catch (e) {
      out.errors.push((e as Error).message);
    }
  }
  if (discordConfigured()) {
    try {
      await sendDiscord({ content: "🧪 **RadarX test alert**", ...discordJob(job) });
      out.channels.push("discord");
    } catch (e) {
      out.errors.push((e as Error).message);
    }
  }
  if (!telegramConfigured() && !discordConfigured()) out.errors.push("No channel configured — set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID (run `npm run telegram:setup`) or DISCORD_WEBHOOK_URL");
  return out;
}
