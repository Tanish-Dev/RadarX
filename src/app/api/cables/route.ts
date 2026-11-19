import { kvGet } from "@/lib/db";
import type { CableCollection } from "@/lib/signals";

/** Submarine cable lines for the map layer (stored weekly by the worker; ~270 KB). */
export async function GET() {
  const cables = await kvGet<CableCollection>("cables");
  if (!cables) return Response.json({ error: "no cable data yet — run `npm run worker -- --signals`" }, { status: 404 });
  return Response.json(cables, { headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800" } });
}
