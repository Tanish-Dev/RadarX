/**
 * npm run rules                                  show alert rules
 * npm run rules -- minScore=60 maxPerRun=8
 * npm run rules -- levels=intern,research regions=india,remote techOnly=true
 * npm run rules -- quiet=23:30-07:00 | quiet=off
 * npm run rules -- telegram=on discord=off
 */
import "../src/worker/env";
import { getRules, setRules, type AlertRules } from "../src/lib/settings";

const patch: Partial<AlertRules> = {};
const cur = await getRules();
for (const a of process.argv.slice(2)) {
  const [k, v] = a.split("=");
  if (k === "levels") patch.levels = v.split(",") as any;
  else if (k === "regions") patch.regions = v.split(",") as any;
  else if (k === "minScore") patch.minScore = Number(v);
  else if (k === "maxPerRun") patch.maxPerRun = Number(v);
  else if (k === "techOnly") patch.techOnly = v === "true" || v === "on";
  else if (k === "quiet") {
    if (v === "off") patch.quietHours = { ...cur.quietHours, enabled: false };
    else {
      const [start, end] = v.split("-");
      patch.quietHours = { enabled: true, start, end };
    }
  } else if (k === "telegram" || k === "discord") patch.channels = { ...cur.channels, ...patch.channels, [k]: v === "on" };
  else console.log(`unknown rule: ${k}`);
}
console.log(JSON.stringify(Object.keys(patch).length ? await setRules(patch) : cur, null, 2));
