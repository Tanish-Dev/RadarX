import { extractSkills } from "./skills";
import { getProfile, setProfile } from "./settings";
import type { Profile } from "./score";

/** Resumes are 1–3 pages; anything far bigger is not a resume (or is an attempt to burn CPU). */
export const MAX_RESUME_PAGES = 12;
export const VISITOR_RESUME_BYTES = 3_000_000;

/** A user-facing parse error (shown as-is); anything else gets a generic message. */
export class ResumeError extends Error {}

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new ResumeError("That file took too long to read — paste the text instead.")), ms))]);
}

const isPdf = (b: Uint8Array) => b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // %PDF

export async function resumeText(input: { pdf?: Uint8Array; text?: string }): Promise<string> {
  if (input.text) return input.text;
  if (!input.pdf) return "";
  if (!isPdf(input.pdf)) throw new ResumeError("That doesn't look like a PDF.");
  const { extractText, getDocumentProxy } = await import("unpdf");
  const doc = await getDocumentProxy(input.pdf);
  try {
    if (doc.numPages > MAX_RESUME_PAGES) throw new ResumeError(`That PDF has ${doc.numPages} pages — a resume should be a few.`);
    const { text } = await extractText(doc, { mergePages: true });
    return Array.isArray(text) ? text.join("\n") : text;
  } finally {
    void (doc as unknown as { cleanup?: () => Promise<unknown> }).cleanup?.()?.catch?.(() => null);
  }
}

/** PDF by magic bytes, else UTF-8 text (.txt/.md). */
export async function readResumeFile(buf: Uint8Array, name: string): Promise<string> {
  if (isPdf(buf)) return resumeText({ pdf: buf });
  if (name.toLowerCase().endsWith(".pdf")) throw new ResumeError("That doesn't look like a PDF.");
  const text = new TextDecoder("utf-8", { fatal: false }).decode(buf.subarray(0, 200_000));
  if (/[\u0000-\u0008\u000e-\u001f]/.test(text.slice(0, 2000))) throw new ResumeError("Upload a PDF or a plain-text file.");
  return text;
}

/** Parse a resume, extract skills, save to the profile (scores are recomputed by the caller/worker). */
export async function saveResume(input: { pdf?: Uint8Array; text?: string }): Promise<Profile> {
  const text = await resumeText(input);
  const prev = await getProfile();
  const p: Profile = { ...prev, resumeText: text.slice(0, 50_000), skills: extractSkills(text) };
  return setProfile(p);
}
