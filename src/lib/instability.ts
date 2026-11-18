/**
 * RadarX Country Instability Index (inspired by World Monitor's CII) — a transparent 0–100 estimate built ONLY from
 * the feeds RadarX already reads: unrest/conflict headlines (weighted by how many outlets carry them), natural hazards,
 * and an attention bump for any unusually busy news day. It is a heuristic for "where is the world loud right now",
 * not an official risk rating. Pure functions (tests/instability.test.ts).
 */
export type Band = "low" | "guarded" | "elevated" | "high" | "critical";

export interface Signals {
  /** [weight] one entry per unrest/conflict story = 1 + 0.5 × (outlets − 1) */
  unrest: number;
  /** summed hazard weights (see hazardWeight) */
  hazard: number;
  /** all stories naming the country, same outlet weighting */
  attention: number;
}

export interface Score {
  total: number;
  unrest: number;
  hazard: number;
  attention: number;
  band: Band;
}

// Narrow on purpose: everyday crime/accident words ("arrest", "killed", "emergency") flooded the score for countries
// with big local-news feeds. Only war / mass-violence / unrest vocabulary counts.
const UNREST_RE =
  /\b(war|wars|airstrikes?|air strikes?|shell(?:ing|ed)|missiles?|drone strikes?|death toll|casualties|bomb(?:ing|ed|s)?|explosions?|clashes|riots?|unrest|curfew|coup|martial law|crackdown|ceasefire|truce|hostages?|militants?|terror(?:ism|ist|ists|ism)?|invasion|offensive|insurgen\w+|assassinat\w+|armed attack|suicide attack|rebels?|troops|frontline|famine|evacuat\w+|protesters|mass protests?|anti-government)\b/i;

/** Does a headline look like conflict / unrest? (Deliberately broad — the score saturates, so one stray match barely moves it.) */
export const isUnrest = (title: string) => UNREST_RE.test(title);

export const storyWeight = (coverage: number) => 1 + 0.5 * Math.max(0, coverage - 1);

export function hazardWeight(kind: string, mag: number | null): number {
  if (kind === "quake") return (mag ?? 0) >= 7 ? 1 : (mag ?? 0) >= 6 ? 0.6 : (mag ?? 0) >= 5 ? 0.25 : 0.1;
  if (kind === "volcano") return 0.4;
  if (kind === "storm") return 0.3;
  if (kind === "flood") return 0.2;
  if (kind === "wildfire") return 0.15;
  return 0.05;
}

const sat = (x: number, k: number) => 1 - Math.exp(-x / k);

export function bandOf(total: number): Band {
  return total >= 80 ? "critical" : total >= 62 ? "high" : total >= 42 ? "elevated" : total >= 22 ? "guarded" : "low";
}

export function scoreOf(s: Signals): Score {
  // a country whose headlines are mostly unrest scores higher than one with the same count buried in lots of ordinary news
  const share = s.unrest / Math.max(1, s.attention);
  const unrest = Math.round(60 * sat(s.unrest, 10) * Math.min(1, 0.35 + share * 2.6));
  const hazard = Math.round(25 * sat(s.hazard, 0.8));
  const attention = Math.round(15 * sat(s.attention, 14));
  const total = Math.min(100, unrest + hazard + attention);
  return { total, unrest, hazard, attention, band: bandOf(total) };
}

export const BAND_LABEL: Record<Band, string> = { low: "Low", guarded: "Guarded", elevated: "Elevated", high: "High", critical: "Critical" };
