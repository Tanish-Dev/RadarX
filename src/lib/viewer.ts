/**
 * Who is looking: the owner (signed session) or a visitor. Visitors never see the owner's resume, skills, scores,
 * stars, pipeline or alerts; their own skills live in a cookie they set themselves (validated against the
 * skill taxonomy, so it can't carry anything else).
 */
import "server-only";
import { cookies } from "next/headers";
import { OWNER_COOKIE, openDevMode, verifySession } from "./owner";
import type { Profile } from "./score";
import { getProfile } from "./settings";
import { VISITOR_COOKIE, parseVisitorProfile } from "./visitorProfile";

export { VISITOR_COOKIE, parseVisitorProfile };


export interface Viewer {
  owner: boolean;
  /** the profile used for match scores: the owner's resume, or the visitor's own picks (null = none yet) */
  profile: Profile | null;
}

export async function isOwner(): Promise<boolean> {
  if (openDevMode()) return true;
  const jar = await cookies();
  return verifySession(jar.get(OWNER_COOKIE)?.value);
}

export async function getViewer(): Promise<Viewer> {
  if (await isOwner()) {
    const p = await getProfile();
    return { owner: true, profile: p.skills.length ? p : null };
  }
  const jar = await cookies();
  return { owner: false, profile: parseVisitorProfile(jar.get(VISITOR_COOKIE)?.value) };
}

/** Server actions that change shared state call this first. */
export async function requireOwner(): Promise<{ ok: false; error: string } | null> {
  return (await isOwner()) ? null : { ok: false, error: "Only the site owner can do that." };
}
