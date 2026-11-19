/** A visitor's own skills cookie — pure (tests/security.test.ts). Anything not in the skill taxonomy is dropped. */
import type { Level, Region } from "./classify";
import { DEFAULT_PROFILE, type Profile } from "./score";
import { canonicalSkill } from "./skills";

export const VISITOR_COOKIE = "rx_profile";
const LEVELS: Level[] = ["intern", "newgrad", "research", "experienced"];
const REGIONS: Region[] = ["india", "remote", "global"];

/** Parse + validate the visitor cookie: `{"s":[skills],"l":[levels],"r":[regions]}`. Anything unknown is dropped. */
export function parseVisitorProfile(raw: string | undefined | null): Profile | null {
  if (!raw || raw.length > 4000) return null;
  try {
    const o = JSON.parse(decodeURIComponent(raw)) as { s?: unknown; l?: unknown; r?: unknown };
    const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 60) : []);
    const skills = [...new Set(arr(o.s).map((s) => canonicalSkill(s)).filter((s): s is string => !!s))].slice(0, 40);
    const levels = arr(o.l).filter((x): x is Level => (LEVELS as string[]).includes(x));
    const regions = arr(o.r).filter((x): x is Region => (REGIONS as string[]).includes(x));
    if (!skills.length) return null;
    return { skills, levels: levels.length ? levels : DEFAULT_PROFILE.levels, regions: regions.length ? regions : DEFAULT_PROFILE.regions };
  } catch {
    return null;
  }
}

