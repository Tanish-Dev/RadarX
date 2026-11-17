import { extractSkills } from "./skills";
import { getProfile, setProfile } from "./settings";
import type { Profile } from "./score";

export async function resumeText(input: { pdf?: Uint8Array; text?: string }): Promise<string> {
  if (input.text) return input.text;
  if (!input.pdf) return "";
  const { extractText, getDocumentProxy } = await import("unpdf");
  const doc = await getDocumentProxy(input.pdf);
  const { text } = await extractText(doc, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : text;
}

/** Parse a resume, extract skills, save to the profile (scores are recomputed by the caller/worker). */
export async function saveResume(input: { pdf?: Uint8Array; text?: string }): Promise<Profile> {
  const text = await resumeText(input);
  const prev = await getProfile();
  const p: Profile = { ...prev, resumeText: text.slice(0, 50_000), skills: extractSkills(text) };
  return setProfile(p);
}
