/**
 * Small in-memory fixed-window rate limiter (per server instance). Good enough to blunt password guessing and
 * scripted abuse of the few public server actions on a free-tier deployment; a determined attacker spreading
 * requests across instances is still slowed by the page cache and the platform's own protections.
 *
 * Three separate stores, so flooding one can never flush another:
 *  - site-wide keys (`…:*`): a handful, never evicted;
 *  - sign-in lockouts (`login-fail:<ip>`): capped; when full, entries that aren't an active lockout are evicted
 *    first (fewest failures, oldest first). If every slot is a live lockout, a new client gets no per-IP limit
 *    (only the site-wide slow-down) rather than being refused — so filling the store can't lock anyone out;
 *  - everything else: capped; oldest windows evicted.
 */
type Bucket = { n: number; reset: number; max: number };
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

function evictInactive(map: Map<string, Bucket>, target: number) {
  const inactive = [...map].filter(([, b]) => b.n <= b.max).sort((a, b) => a[1].n - b[1].n || a[1].reset - b[1].reset);
  for (const [k] of inactive) {
    if (map.size < target) break;
    map.delete(k);
  }
}

function bucket(key: string, max: number, windowMs: number, now: number): Bucket {
  const { map, max: cap, failClosed } = storeFor(key);
  let b = map.get(key);
  if (b && b.reset < now) (map.delete(key), (b = undefined));
  if (b) return b;
  b = { n: 0, reset: now + windowMs, max };
  if (map.size >= cap) {
    for (const [k, v] of map) if (v.reset < now) map.delete(k);
    if (map.size >= cap) {
      if (failClosed) {
        evictInactive(map, cap * 0.9);
        if (map.size >= cap) return b; // all live lockouts: untracked bucket (no per-IP limit), never a refusal
      } else {
        for (const k of map.keys()) {
          if (map.size < cap * 0.9) break;
          map.delete(k); // Map keeps insertion order → oldest first
        }
      }
    }
  }
  map.set(key, b);
  return b;
}

/** Count one hit; ok=false once more than `max` hits landed in the window (or the store is full and fails closed). */
export function rateLimit(key: string, max: number, windowMs: number, now = Date.now()): { ok: boolean; retryAfterS: number } {
  const b = bucket(key, max, windowMs, now);
  b.n++;
  return b.n <= max ? { ok: true, retryAfterS: 0 } : { ok: false, retryAfterS: Math.ceil((b.reset - now) / 1000) };
}

/** Take back one hit (e.g. an attempt reserved up front that turned out fine). */
export function refund(key: string) {
  const { map } = storeFor(key);
  const b = map.get(key);
  if (b && b.n > 0) b.n--;
  if (b && b.n === 0 && !key.endsWith(":*")) map.delete(key); // successful sign-ins leave nothing behind
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
    if (v) return group(v);
  }
  const n = Number(env.TRUSTED_PROXY_HOPS);
  if (Number.isInteger(n) && n >= 1 && n <= 5) {
    const hops = (h.get("x-forwarded-for") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    const ip = hops.at(-n);
    if (ip) return group(ip);
  }
  return env.VERCEL ? "unknown" : "direct";
}

/** "direct"/"unknown" = no trusted client IP: callers must not apply hard per-IP refusals to that shared bucket. */
export const isSharedIp = (ip: string) => ip === "direct" || ip === "unknown";

/** IPv6 clients are grouped by /64 (one subscriber's block) so a single host can't mint endless keys. */
function group(ip: string): string {
  const v = ip.trim().slice(0, 64);
  if (!v.includes(":") || /^[\d.]+$/.test(v)) return v;
  const parts = v.split("%")[0].split("::");
  const head = parts[0] ? parts[0].split(":") : [];
  const tail = parts.length > 1 && parts[1] ? parts[1].split(":") : [];
  const full = parts.length > 1 ? [...head, ...Array(Math.max(0, 8 - head.length - tail.length)).fill("0"), ...tail] : head;
  return `${full.slice(0, 4).map((x) => x.toLowerCase().replace(/^0+(?=.)/, "")).join(":")}::/64`;
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
