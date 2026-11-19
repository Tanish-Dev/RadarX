import { extractSkills } from "./skills";
import { getProfile, setProfile } from "./settings";
import type { Profile } from "./score";

/** Resumes are 1–3 pages; anything far bigger is not a resume (or is an attempt to burn CPU). */
export const MAX_RESUME_PAGES = 12;
export const VISITOR_RESUME_BYTES = 3_000_000;

/** A user-facing parse error (shown as-is); anything else gets a generic message. */
export class ResumeError extends Error {}

const isPdf = (b: Uint8Array) => b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // %PDF

/** At most this many PDFs are parsed at once per server instance; extra uploads wait (bounded) or are refused. */
const MAX_PARALLEL = 2;
let active = 0;
const queue: (() => void)[] = [];
async function slot(): Promise<() => void> {
  if (active >= MAX_PARALLEL) {
    if (queue.length >= 4) throw new ResumeError("The resume reader is busy — try again in a moment.");
    await new Promise<void>((r) => queue.push(r));
  }
  active++;
  return () => {
    active--;
    queue.shift()?.();
  };
}

/**
 * PDF → text. With `deadlineMs`, the parse is really stopped when time runs out (pdf.js is torn down and no
 * further pages are read) — not just abandoned in the background.
 */
export async function resumeText(input: { pdf?: Uint8Array; text?: string }, opts: { deadlineMs?: number } = {}): Promise<string> {
  if (input.text) return input.text;
  if (!input.pdf) return "";
  if (!isPdf(input.pdf)) throw new ResumeError("That doesn't look like a PDF.");
  const release = await slot();
  const { getDocumentProxy } = await import("unpdf");
  type Doc = Awaited<ReturnType<typeof getDocumentProxy>> & { destroy?: () => Promise<void> };
  let doc: Doc | null = null;
  let timedOut = false;
  const stop = () => {
    timedOut = true;
    void doc?.destroy?.().catch(() => null);
  };
  const timer = opts.deadlineMs ? setTimeout(stop, opts.deadlineMs) : null;
  const tooSlow = () => new ResumeError("That file took too long to read — paste the text instead.");
  try {
    doc = (await getDocumentProxy(input.pdf)) as Doc;
    if (timedOut) throw tooSlow();
    if (doc.numPages > MAX_RESUME_PAGES) throw new ResumeError(`That PDF has ${doc.numPages} pages — a resume should be a few.`);
    const out: string[] = [];
    let chars = 0;
    for (let i = 1; i <= doc.numPages && chars < 100_000; i++) {
      if (timedOut) throw tooSlow();
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      const t = tc.items.map((it) => ("str" in it ? it.str : "")).join(" ");
      out.push(t);
      chars += t.length;
    }
    if (timedOut) throw tooSlow();
    return out.join("\n");
  } catch (e) {
    if (timedOut && !(e instanceof ResumeError)) throw tooSlow();
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
    void doc?.destroy?.().catch(() => null);
    release();
  }
}

/** PDF by magic bytes, else UTF-8 text (.txt/.md). */
export async function readResumeFile(buf: Uint8Array, name: string, opts: { deadlineMs?: number } = {}): Promise<string> {
  if (isPdf(buf)) return resumeText({ pdf: buf }, opts);
  if (name.toLowerCase().endsWith(".pdf")) throw new ResumeError("That doesn't look like a PDF.");
  const text = new TextDecoder("utf-8", { fatal: false }).decode(buf.subarray(0, 200_000));
  if (/[\u0000-\u0008\u000e-\u001f]/.test(text.slice(0, 2000))) throw new ResumeError("Upload a PDF or a plain-text file.");
  return text;
}

/** Parse a resume, extract skills, save to the profile (scores are recomputed by the caller/worker). */
export async function saveResume(input: { pdf?: Uint8Array; text?: string }): Promise<Profile> {
  const text = await resumeText(input, { deadlineMs: 20_000 });
  const prev = await getProfile();
  const p: Profile = { ...prev, resumeText: text.slice(0, 50_000), skills: extractSkills(text) };
  return setProfile(p);
}
