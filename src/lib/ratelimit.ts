/**
 * Small in-memory fixed-window rate limiter (per server instance). Good enough to blunt password guessing and
 * scripted abuse of the few public server actions on a free-tier deployment; a determined attacker spreading
 * requests across instances is still slowed by the page cache and the platform's own protections.
 */
const buckets = new Map<string, { n: number; reset: number }>();
const MAX_BUCKETS = 10_000;

function bucket(key: string, windowMs: number, now: number) {
  let b = buckets.get(key);
  if (b && b.reset < now) (buckets.delete(key), (b = undefined));
  if (!b) {
    if (buckets.size >= MAX_BUCKETS) {
      for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
      // still full: evict the oldest windows (Map keeps insertion order) — memory stays bounded whatever the keys
      for (const k of buckets.keys()) {
        if (buckets.size < MAX_BUCKETS * 0.9) break;
        buckets.delete(k);
      }
    }
    b = { n: 0, reset: now + windowMs };
    buckets.set(key, b);
  }
  return b;
}

/** Count one hit; ok=false once more than `max` hits landed in the window. */
export function rateLimit(key: string, max: number, windowMs: number, now = Date.now()): { ok: boolean; retryAfterS: number } {
  const b = bucket(key, windowMs, now);
  b.n++;
  return b.n <= max ? { ok: true, retryAfterS: 0 } : { ok: false, retryAfterS: Math.ceil((b.reset - now) / 1000) };
}

/** Check without counting (count separately with rateLimit, e.g. only on failures). */
export function peekLimit(key: string, max: number, now = Date.now()): { ok: boolean; retryAfterS: number } {
  const b = buckets.get(key);
  if (!b || b.reset < now || b.n < max) return { ok: true, retryAfterS: 0 };
  return { ok: false, retryAfterS: Math.ceil((b.reset - now) / 1000) };
}

/**
 * Client IP from a header the client can't forge. On Vercel, `x-vercel-forwarded-for` / `x-real-ip` are set by
 * the edge (any client-sent copy is overwritten). Elsewhere, the LAST x-forwarded-for hop is the one our own
 * reverse proxy appended — the first entry is whatever the client claimed, so it's never used.
 */
export function clientIp(h: Headers): string {
  const trusted = h.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim();
  const lastHop = h.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  return (trusted || lastHop || "local").slice(0, 64);
}

export function _resetRateLimits() {
  buckets.clear();
}
