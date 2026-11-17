// MapLibre 6 loads its tile worker from a separate file located via import.meta.url, which
// the Next.js bundler rewrites. Serve it as a static file instead (see LiveMap setWorkerUrl).
import { copyFileSync, mkdirSync } from "node:fs";
mkdirSync("public", { recursive: true });
copyFileSync("node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", "public/maplibre-gl-worker.mjs");
console.log("copied maplibre-gl-worker.mjs → public/");
