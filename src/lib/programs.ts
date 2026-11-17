/** Program page watcher helpers + status logic (pure; tested). */
import type { Program } from "../data/programs";
import { htmlToText } from "./text";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Lines of the page that mention a watch keyword — only these are hashed, so unrelated edits don't alert. */
export function extractWatchLines(html: string, keywords: string[]): string[] {
  const text = htmlToText(html);
  const kws = keywords.map((k) => k.toLowerCase()).filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/\n+/)) {
    const line = raw.replace(/\s+/g, " ").trim().replace(/^[•*·-]\s*/, "");
    if (line.length < 4 || line.length > 400) continue;
    const l = line.toLowerCase();
    if (!kws.some((k) => l.includes(k))) continue;
    if (seen.has(l)) continue;
    seen.add(l);
    out.push(line);
    if (out.length >= 150) break;
  }
  return out;
}

const DEADLINE_HINT = /(last date|deadline|closing date|apply by|applications? close|closes? on|due date|till|until|before)/i;

function parseDate(s: string): number | null {
  const t = s.toLowerCase();
  // 15 December 2026 / 15th Dec, 2026
  let m = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+(20\d\d)\b/);
  if (m) return Date.UTC(+m[3], MONTHS.indexOf(m[2]), +m[1], 18, 29); // end of day IST
  // December 15, 2026
  m = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d\d)\b/);
  if (m) return Date.UTC(+m[3], MONTHS.indexOf(m[1]), +m[2], 18, 29);
  // 15.12.2026 / 15/12/2026 / 15-12-2026 (Indian day-first)
  m = t.match(/\b(\d{1,2})[./-](\d{1,2})[./-](20\d\d)\b/);
  if (m && +m[2] >= 1 && +m[2] <= 12 && +m[1] <= 31) return Date.UTC(+m[3], +m[2] - 1, +m[1], 18, 29);
  return null;
}

/** Earliest future date on a line that reads like a deadline. */
export function extractDeadline(lines: string[], now = Date.now()): number | null {
  let best: number | null = null;
  for (const line of lines) {
    if (!DEADLINE_HINT.test(line)) continue;
    const d = parseDate(line);
    if (d && d > now && d < now + 400 * 86_400_000 && (best == null || d < best)) best = d;
  }
  return best;
}

export type ProgramStatus = "closing" | "open" | "rolling" | "soon" | "closed";
export interface StatusInfo {
  status: ProgramStatus;
  label: string;
  tone: "warn" | "new" | "accent" | "outline";
}

const inWindow = (month: number, w: { open: number; close: number }) =>
  w.open <= w.close ? month >= w.open && month <= w.close : month >= w.open || month <= w.close;

/** Status from (1) a deadline read off the page, else (2) the typical window. */
export function programStatus(p: Pick<Program, "window">, deadline: number | null, now = Date.now()): StatusInfo {
  const DAY = 86_400_000;
  if (deadline && deadline > now) {
    const days = Math.ceil((deadline - now) / DAY);
    if (days <= 14) return { status: "closing", label: days <= 1 ? "Closes today" : `Closes in ${days} days`, tone: "warn" };
    const d = new Date(deadline);
    return { status: "open", label: `Open · closes ${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]}`, tone: "new" };
  }
  if (p.window === "rolling") return { status: "rolling", label: "Rolling", tone: "accent" };
  const month = new Date(now + 330 * 60_000).getUTCMonth() + 1; // IST month
  if (inWindow(month, p.window)) return { status: "open", label: "Open (typical window)", tone: "new" };
  const next = month === 12 ? 1 : month + 1;
  if (p.window.open === next) return { status: "soon", label: `Opens ~${MONTH_NAMES[p.window.open - 1]}`, tone: "accent" };
  return { status: "closed", label: `Opens ~${MONTH_NAMES[p.window.open - 1]}`, tone: "outline" };
}

export function windowLabel(w: Program["window"]): string {
  if (w === "rolling") return "Rolling / per notice";
  return `${MONTH_NAMES[w.open - 1]} – ${MONTH_NAMES[w.close - 1]}`;
}
