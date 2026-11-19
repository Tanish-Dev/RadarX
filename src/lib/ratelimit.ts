/**
 * Small in-memory fixed-window rate limiter (per server instance). Good enough to blunt password guessing and
 * scripted abuse of the few public server actions on a free-tier deployment; a determined attacker spreading
 * requests across instances is still slowed by the page cache and the platform's own protections.
 *
 * Three separate stores, so flooding one can never flush another:
 *  - site-wide keys (`…:*`): a handful, never evicted;
 *  - sign-in lockouts (`login-fail:<ip>`): capped; when full, NEW clients are refused (fail closed) — live
 *    lockouts are never evicted;
 *  - everything else: capped; oldest windows evicted.
 */
type Bucket = { n: number; reset: number };
const general = new Map<string, Bucket>();
const lockouts = new Map<string, Bucket>();
const sitewide = new Map<string, Bucket>();
const MAX_GENERAL = 10_000;
const MAX_LOCKOUTS = 20_000;

function storeFor(key: string) {
  if (key.endsWith(":*")) return { map: sitewide, max: Infinity, failClosed: false };
  if (key.startsWith("login-fail:")) return { map: lockouts, max: MAX_LOCKOUTS, failClosed: true };
  return { map: general, max: MAX_GENERAL, failClosed: false };
}

function bucket(key: string, windowMs: number, now: number): Bucket | null {
  const { map, max, failClosed } = storeFor(key);
  let b = map.get(key);
  if (b && b.reset < now) (map.delete(key), (b = undefined));
  if (b) return b;
  if (map.size >= max) {
    for (const [k, v] of map) if (v.reset < now) map.delete(k);
    if (map.size >= max) {
      if (failClosed) return null; // never evict a live lockout to make room
      for (const k of map.keys()) {
        if (map.size < max * 0.9) break;
        map.delete(k); // Map keeps insertion order → oldest first
      }
    }
  }
  b = { n: 0, reset: now + windowMs };
  map.set(key, b);
  return b;
}

/** Count one hit; ok=false once more than `max` hits landed in the window (or the store is full and fails closed). */
export function rateLimit(key: string, max: number, windowMs: number, now = Date.now()): { ok: boolean; retryAfterS: number } {
  const b = bucket(key, windowMs, now);
  if (!b) return { ok: false, retryAfterS: Math.ceil(windowMs / 1000) };
  b.n++;
  return b.n <= max ? { ok: true, retryAfterS: 0 } : { ok: false, retryAfterS: Math.ceil((b.reset - now) / 1000) };
}

/** Take back one hit (e.g. an attempt reserved up front that turned out fine). */
export function refund(key: string) {
  const b = storeFor(key).map.get(key);
  if (b && b.n > 0) b.n--;
}

/**
 * Client IP from a source the client can't forge.
 * - On Vercel (VERCEL set): `x-vercel-forwarded-for` / `x-real-ip`, set by the edge (client copies are overwritten).
 * - Behind your own proxy: set TRUSTED_PROXY_HOPS=n and the n-th x-forwarded-for entry from the right is used.
 * - Otherwise forwarding headers are just client input and are ignored: everyone shares one bucket ("direct"),
 *   which is stricter, never looser.
 */
export function clientIp(h: Headers, env: Record<string, string | undefined> = process.env): string {
  if (env.VERCEL) {
    const v = h.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim();
    if (v) return v.slice(0, 64);
  }
  const n = Number(env.TRUSTED_PROXY_HOPS);
  if (Number.isInteger(n) && n >= 1 && n <= 5) {
    const hops = (h.get("x-forwarded-for") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    const ip = hops.at(-n);
    if (ip) return ip.slice(0, 64);
  }
  return env.VERCEL ? "unknown" : "direct";
}

/** Failed sign-ins site-wide in the current window (drives the growing delay in `login`). */
export function siteLoginFailures(now = Date.now()): number {
  const b = sitewide.get("login-fail:*");
  return b && b.reset >= now ? b.n : 0;
}

export function _resetRateLimits() {
  general.clear();
  lockouts.clear();
  sitewide.clear();
}
