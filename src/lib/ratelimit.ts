/**
 * Small in-memory fixed-window rate limiter (per server instance). Good enough to blunt password guessing and
 * scripted abuse of the few public server actions on a free-tier deployment; a determined attacker spreading
 * requests across instances is still slowed by the page cache and the platform's own protections.
 */
const buckets = new Map<string, { n: number; reset: number }>();
const MAX_BUCKETS = 10_000;
const PROTECTED = "login-fail:";

function bucket(key: string, windowMs: number, now: number) {
  let b = buckets.get(key);
  if (b && b.reset < now) (buckets.delete(key), (b = undefined));
  if (!b) {
    if (buckets.size >= MAX_BUCKETS) {
      for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
      // still full: evict the oldest windows (Map keeps insertion order) — but never a live sign-in lockout, or an
      // attacker could flush their own failure count by flooding other keys. Lockout keys are one per real client
      // IP (unforgeable, see clientIp), so they stay bounded on their own.
      for (const k of buckets.keys()) {
        if (buckets.size < MAX_BUCKETS * 0.9) break;
        if (!k.startsWith(PROTECTED)) buckets.delete(k);
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

/**
 * Client IP from a header the client can't forge. On Vercel (and only there), `x-vercel-forwarded-for` /
 * `x-real-ip` are set by the edge, which overwrites any client-sent copy. Anywhere else those headers are just
 * client input, so only the LAST x-forwarded-for hop is used — the one our own reverse proxy appended — or
 * TRUSTED_PROXY_HOPS hops from the right when there are several proxies. The first entry is never used.
 */
export function clientIp(h: Headers, env: Record<string, string | undefined> = process.env): string {
  if (env.VERCEL) {
    const v = h.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim();
    if (v) return v.slice(0, 64);
  }
  const hops = (h.get("x-forwarded-for") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const n = Math.max(1, Math.min(5, Number(env.TRUSTED_PROXY_HOPS) || 1));
  return (hops.at(-n) ?? hops[0] ?? "local").slice(0, 64);
}

/** Take back one hit (e.g. an attempt reserved up front that turned out fine). */
export function refund(key: string) {
  const b = buckets.get(key);
  if (b && b.n > 0) b.n--;
}

export function _resetRateLimits() {
  buckets.clear();
}

/** Failed sign-ins site-wide in the current window (drives the growing delay in `login`). */
export function siteLoginFailures(now = Date.now()): number {
  const b = buckets.get("login-fail:*");
  return b && b.reset >= now ? b.n : 0;
}
