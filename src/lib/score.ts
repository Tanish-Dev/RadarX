/**
 * Match score 0–100 between the resume profile and a job. The resume only *ranks*
 * postings; it never hides them. Returns null when there is no resume.
 */
import type { Level, Region } from "./classify";

export interface Profile {
  skills: string[];
  levels: Level[];
  regions: Region[];
  resumeText?: string;
  updatedAt?: number;
}

export const DEFAULT_PROFILE: Profile = {
  skills: [],
  levels: ["intern", "research", "newgrad"],
  regions: ["india", "remote"],
};

export interface ScoreInput {
  skills: string[];
  titleSkills: string[];
  level: Level | null;
  region: Region | null;
  is_tech: boolean;
}

export interface ScoreBreakdown {
  score: number;
  matched: string[];
  missing: string[];
}

/**
 * - 60 pts: how much of what the job asks for you have (capped denominator, so long JDs
 *   listing 25 skills aren't unfairly hard to match; floor of 3 so a 1-skill posting can't max out)
 * - 15 pts: a title skill matches (e.g. "ML Engineer Intern" and you know ML)
 * - 15 pts: level is one you want · 10 pts: region is one you want
 * Jobs without extracted skills (title-only sources) get a neutral 30% skill credit.
 */
export function scoreJob(job: ScoreInput, profile: Profile): ScoreBreakdown | null {
  if (!profile.skills.length) return null;
  const mine = new Set(profile.skills);
  const matched = job.skills.filter((s) => mine.has(s));
  const missing = job.skills.filter((s) => !mine.has(s));

  let skillPts: number;
  if (job.skills.length === 0) skillPts = 60 * 0.3;
  else skillPts = 60 * Math.min(1, matched.length / Math.max(3, Math.min(job.skills.length, 8)));

  const titlePts = job.titleSkills.some((s) => mine.has(s)) ? 15 : 0;
  const levelPts = job.level && profile.levels.includes(job.level) ? 15 : 0;
  const regionPts = job.region && profile.regions.includes(job.region) ? 10 : job.region === "global" ? 3 : 0;

  let score = skillPts + titlePts + levelPts + regionPts;
  if (!job.is_tech) score *= 0.5;
  return { score: Math.round(Math.max(0, Math.min(100, score))), matched, missing };
}
