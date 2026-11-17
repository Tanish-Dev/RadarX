// Load .env.local / .env for the standalone worker (Next.js loads these itself).
import { existsSync } from "node:fs";

for (const f of [".env.local", ".env"]) {
  if (existsSync(f)) process.loadEnvFile(f);
}
