/** Classification + scoring persistence. */
import { classify, CLASSIFIER_VERSION, type Level, type Region } from "./classify";
import { db, kvGet, kvSet } from "./db";
import { scoreJob, type Profile } from "./score";
import { getProfile } from "./settings";

/** Aggregate lists imply a level when the title doesn't say. */
export function levelHint(source: string): Level | undefined {
  if (/new-grad/i.test(source)) return "newgrad";
  if (/intern/i.test(source)) return "intern";
  return undefined;
}

const PAGE = 1000;

/** Classify (and score) every job whose classifier_version is behind. Returns count. */
export async function classifyPending(): Promise<number> {
  const c = await db();
  const profile = await getProfile();
  let total = 0;
  for (;;) {
    const r = await c.execute({
      sql: `SELECT id, source, title, description, location, category FROM jobs WHERE classifier_version < ? LIMIT ?`,
      args: [CLASSIFIER_VERSION, PAGE],
    });
    if (!r.rows.length) break;
    const stmts = r.rows.map((row) => {
      const cl = classify(
        { title: String(row.title), description: String(row.description), location: String(row.location) },
        levelHint(String(row.source)) ?? (row.category === "fresher" ? "newgrad" : row.category === "internship" ? "intern" : undefined),
      );
      const s = scoreJob(cl, profile);
      return {
        sql: `UPDATE jobs SET is_tech=?, level=?, region=?, domain=?, skills=?, title_skills=?, score=?, classifier_version=? WHERE id=?`,
        args: [cl.is_tech ? 1 : 0, cl.level, cl.region, cl.domain, JSON.stringify(cl.skills), JSON.stringify(cl.titleSkills), s?.score ?? null, CLASSIFIER_VERSION, row.id],
      };
    });
    await c.batch(stmts as any, "write");
    total += r.rows.length;
  }
  return total;
}

/** Recompute every score from stored skills (cheap — no regexes). */
export async function rescoreAll(profile?: Profile): Promise<number> {
  const c = await db();
  const p = profile ?? (await getProfile());
  let last = "";
  let total = 0;
  for (;;) {
    const r = await c.execute({
      sql: `SELECT id, skills, title_skills, level, region, is_tech FROM jobs WHERE id > ? ORDER BY id LIMIT ?`,
      args: [last, PAGE * 2],
    });
    if (!r.rows.length) break;
    const stmts = r.rows.map((row) => {
      const s = scoreJob(
        {
          skills: JSON.parse(String(row.skills)),
          titleSkills: JSON.parse(String(row.title_skills)),
          level: (row.level as Level) ?? null,
          region: (row.region as Region) ?? null,
          is_tech: Number(row.is_tech) === 1,
        },
        p,
      );
      return { sql: `UPDATE jobs SET score=? WHERE id=?`, args: [s?.score ?? null, row.id] };
    });
    await c.batch(stmts as any, "write");
    last = String(r.rows[r.rows.length - 1].id);
    total += r.rows.length;
  }
  await kvSet("scored_profile_at", p.updatedAt ?? 0);
  return total;
}

/** Rescore if the resume/profile changed since the last scoring pass. */
export async function rescoreIfProfileChanged(): Promise<number> {
  const p = await getProfile();
  const scoredAt = (await kvGet<number>("scored_profile_at")) ?? 0;
  if ((p.updatedAt ?? 0) === scoredAt) return 0;
  return rescoreAll(p);
}
