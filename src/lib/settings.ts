import type { Level, Region } from "./classify";
import { kvGet, kvSet } from "./db";
import { DEFAULT_PROFILE, type Profile } from "./score";

export interface AlertRules {
  levels: Level[];
  regions: Region[];
  techOnly: boolean;
  /** only applies once a resume is uploaded (score is null before that) */
  minScore: number;
  /** individual messages per run; the rest become one summary message */
  maxPerRun: number;
  quietHours: { enabled: boolean; start: string; end: string }; // "HH:MM" in IST
  channels: { telegram: boolean; discord: boolean };
}

export const DEFAULT_RULES: AlertRules = {
  levels: ["intern", "newgrad", "research"],
  regions: ["india", "remote", "global"],
  techOnly: true,
  minScore: 0,
  maxPerRun: 10,
  quietHours: { enabled: false, start: "23:30", end: "07:00" },
  channels: { telegram: true, discord: true },
};

export async function getRules(): Promise<AlertRules> {
  const r = await kvGet<Partial<AlertRules>>("alert_rules");
  return { ...DEFAULT_RULES, ...r, quietHours: { ...DEFAULT_RULES.quietHours, ...r?.quietHours }, channels: { ...DEFAULT_RULES.channels, ...r?.channels } };
}

export async function setRules(patch: Partial<AlertRules>): Promise<AlertRules> {
  const next = { ...(await getRules()), ...patch };
  await kvSet("alert_rules", next);
  return next;
}

export async function getProfile(): Promise<Profile> {
  const p = await kvGet<Partial<Profile>>("profile");
  return { ...DEFAULT_PROFILE, ...p };
}

export async function setProfile(p: Profile): Promise<Profile> {
  const saved = { ...p, updatedAt: Date.now() };
  await kvSet("profile", saved);
  return saved;
}

const IST_OFFSET_MIN = 330;
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};

/** Is `now` inside the quiet window (IST)? Handles windows that cross midnight. */
export function inQuietHours(q: AlertRules["quietHours"], now = Date.now()): boolean {
  if (!q.enabled) return false;
  const d = new Date(now);
  const ist = (d.getUTCHours() * 60 + d.getUTCMinutes() + IST_OFFSET_MIN) % 1440;
  const s = toMin(q.start), e = toMin(q.end);
  return s <= e ? ist >= s && ist < e : ist >= s || ist < e;
}
