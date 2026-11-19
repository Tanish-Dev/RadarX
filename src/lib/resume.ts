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
 * PDF → text. The whole parse races a deadline: when it fires the caller gets an error at once, the concurrency
 * slot is released at once (a hostile file can't hold it), and pdf.js's loading task is destroyed — which also
 * tears down a document still being loaded — so no further pages are read.
 */
export async function resumeText(input: { pdf?: Uint8Array; text?: string }, opts: { deadlineMs?: number } = {}): Promise<string> {
  if (input.text) return input.text;
  if (!input.pdf) return "";
  if (!isPdf(input.pdf)) throw new ResumeError("That doesn't look like a PDF.");
  const pdf = input.pdf;
  let cancelled = false;
  let task: { destroy: () => Promise<void> } | null = null;
  const tooSlow = () => new ResumeError("That file took too long to read — paste the text instead.");
  const stop = () => {
    cancelled = true;
    void task?.destroy().catch(() => null); // also aborts a document that is still loading
  };
  let timer: ReturnType<typeof setTimeout> | undefined;

  // The concurrency slot is held until the parse has really ended (not just until the caller gave up), so a
  // hostile file can't free its slot early and let more parses pile up; teardown makes that end come quickly.
  const work = (async () => {
    const release = await slot();
    try {
      if (cancelled) return "";
      const { getResolvedPDFJS } = await import("unpdf");
      if (cancelled) return "";
      const { getDocument } = await getResolvedPDFJS();
      if (cancelled) return "";
      const t = getDocument({ data: pdf, disableFontFace: true, useSystemFonts: false, stopAtErrors: true });
      task = t;
      const doc = await t.promise;
      if (cancelled) return "";
      if (doc.numPages > MAX_RESUME_PAGES) throw new ResumeError(`That PDF has ${doc.numPages} pages — a resume should be a few.`);
      const out: string[] = [];
      let chars = 0;
      for (let i = 1; i <= doc.numPages && chars < 100_000; i++) {
        const page = await doc.getPage(i);
        if (cancelled) return "";
        const tc = await page.getTextContent();
        if (cancelled) return "";
        const text = tc.items.map((it) => ("str" in it ? it.str : "")).join(" ");
        out.push(text);
        chars += text.length;
      }
      return out.join("\n");
    } finally {
      void task?.destroy().catch(() => null);
      release();
    }
  })();
  work.catch(() => null); // an abandoned parse may reject after teardown

  const deadline = opts.deadlineMs
    ? new Promise<never>((_, rej) => (timer = setTimeout(() => (stop(), rej(tooSlow())), opts.deadlineMs)))
    : null;
  try {
    return await (deadline ? Promise.race([work, deadline]) : work);
  } finally {
    clearTimeout(timer);
    cancelled = true;
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
