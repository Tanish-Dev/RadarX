import { ago } from "../lib/time";

export interface AlertJob {
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  level: string | null;
  region: string | null;
  score: number | null;
  posted_at: number | null;
  first_seen_at: number;
  skills?: string[];
}

const LEVEL_LABEL: Record<string, string> = { intern: "Internship", newgrad: "New grad", research: "Research", experienced: "Experienced" };
const REGION_LABEL: Record<string, string> = { india: "🇮🇳 India", remote: "🌐 Remote", global: "🌍 Abroad" };

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function dashboardUrl(): string | null {
  const u = process.env.DASHBOARD_URL?.replace(/\/$/, "");
  return u && /^https:\/\//.test(u) ? u : null; // Telegram rejects non-https button URLs
}

/** The timestamp shown as "posted X ago": the source date, else when we first saw it. */
const postedTs = (j: AlertJob) => j.posted_at ?? j.first_seen_at;

export function telegramJob(j: AlertJob, now = Date.now()) {
  const meta = [j.level && LEVEL_LABEL[j.level], j.region && REGION_LABEL[j.region], j.score != null && `🎯 <b>${j.score}%</b> match`]
    .filter(Boolean)
    .join("  ·  ");
  const loc = j.location ? `📍 ${escapeHtml(truncate(j.location, 90))}` : "";
  const text = [
    `<b>${escapeHtml(j.title)}</b>`,
    `🏢 ${escapeHtml(j.company)}${loc ? "\n" + loc : ""}`,
    meta,
    `⏱ posted ${ago(postedTs(j), now)}${j.posted_at == null ? " (first seen)" : ""}`,
    j.skills?.length ? `🧩 ${escapeHtml(j.skills.slice(0, 6).join(", "))}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const buttons = [{ text: "Apply ↗", url: j.url }];
  const dash = dashboardUrl();
  if (dash) buttons.push({ text: "Open in RadarX", url: `${dash}/feed?job=${encodeURIComponent(j.id)}` });
  return { text, reply_markup: { inline_keyboard: [buttons] } };
}

export function telegramSummary(overflow: AlertJob[], counts: Record<string, number>) {
  const parts = Object.entries(counts).map(([k, v]) => `${v} ${LEVEL_LABEL[k]?.toLowerCase() ?? k}`);
  const top = overflow
    .slice(0, 8)
    .map((j) => `• <a href="${escapeHtml(j.url)}">${escapeHtml(truncate(j.title, 60))}</a> — ${escapeHtml(j.company)}${j.score != null ? ` (${j.score}%)` : ""}`)
    .join("\n");
  const dash = dashboardUrl();
  const text = `📡 <b>+${overflow.length} more new postings</b>\n${parts.join(" · ")}\n\n${top}${overflow.length > 8 ? `\n…and ${overflow.length - 8} more` : ""}`;
  return {
    text,
    reply_markup: dash ? { inline_keyboard: [[{ text: "Open feed", url: `${dash}/feed?within=1h` }]] } : undefined,
  };
}

export function discordJob(j: AlertJob, now = Date.now()) {
  return {
    embeds: [
      {
        title: truncate(j.title, 250),
        url: j.url,
        color: 0x2f7bff,
        description: [
          `**${j.company}**${j.location ? ` · ${truncate(j.location, 120)}` : ""}`,
          [j.level && LEVEL_LABEL[j.level], j.region && REGION_LABEL[j.region], j.score != null && `🎯 **${j.score}%** match`].filter(Boolean).join(" · "),
          `posted ${ago(postedTs(j), now)}`,
        ].join("\n"),
      },
    ],
  };
}

export function discordSummary(overflow: AlertJob[]) {
  return {
    content: `📡 **+${overflow.length} more new postings**\n` + overflow.slice(0, 10).map((j) => `• [${truncate(j.title, 80)}](<${j.url}>) — ${j.company}`).join("\n"),
  };
}

/** Plain-text line stored in the `alerts` table (feeds the bell dropdown). */
export function plainLine(j: AlertJob) {
  return `${j.title} — ${j.company}${j.score != null ? ` (${j.score}%)` : ""}`;
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
