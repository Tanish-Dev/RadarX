/**
 * npm run resume -- path/to/resume.pdf   (or .txt / .md)
 * npm run resume -- --show
 * Extracts skills, saves the profile, and rescores every posting.
 * (The Settings page will do the same from the browser in Phase 3.)
 */
import "../src/worker/env";
import { readFileSync } from "node:fs";
import { rescoreAll } from "../src/lib/jobs";
import { saveResume } from "../src/lib/resume";
import { getProfile } from "../src/lib/settings";

const arg = process.argv[2];
if (!arg || arg === "--show") {
  const p = await getProfile();
  console.log(p.skills.length ? `Skills (${p.skills.length}): ${p.skills.join(", ")}` : "No resume yet. Usage: npm run resume -- ~/resume.pdf");
  console.log(`Levels: ${p.levels.join(", ")} · Regions: ${p.regions.join(", ")}`);
  process.exit(0);
}
const buf = readFileSync(arg);
const p = await saveResume(arg.toLowerCase().endsWith(".pdf") ? { pdf: new Uint8Array(buf) } : { text: buf.toString("utf8") });
console.log(`Extracted ${p.skills.length} skills: ${p.skills.join(", ")}`);
const n = await rescoreAll(p);
console.log(`Rescored ${n} postings.`);
