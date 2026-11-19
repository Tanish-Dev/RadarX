/**
 * Small in-memory fixed-window rate limiter (per server instance). Good enough to blunt password guessing and
 * scripted abuse of the few public server actions on a free-tier deployment; a determined attacker spreading
 * requests across instances is still slowed by the page cache and the platform's own protections.
 */
const buckets = new Map<string, { n: number; reset: number }>();

export function rateLimit(key: string, max: number, windowMs: number, now = Date.now()): { ok: boolean; retryAfterS: number } {
  if (buckets.size > 10_000) for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k); // bounded memory
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { n: 1, reset: now + windowMs });
    return { ok: true, retryAfterS: 0 };
  }
  b.n++;
  return b.n <= max ? { ok: true, retryAfterS: 0 } : { ok: false, retryAfterS: Math.ceil((b.reset - now) / 1000) };
}

/** Client IP as seen by the platform proxy (Vercel sets x-forwarded-for / x-real-ip). */
export function clientIp(h: Headers): string {
  const xff = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (xff || h.get("x-real-ip") || "local").slice(0, 64);
}

export function _resetRateLimits() {
  buckets.clear();
}
