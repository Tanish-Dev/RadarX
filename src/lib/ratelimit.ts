import { isIP } from "node:net";

/**
 * Small in-memory fixed-window rate limiter (per server instance). Good enough to blunt password guessing and
 * scripted abuse of the few public server actions on a free-tier deployment; a determined attacker spreading
 * requests across instances is still slowed by the page cache and the platform's own protections.
 *
 * Three separate stores, so flooding one can never flush another:
 *  - site-wide keys (`…:*`): a handful, never evicted;
 *  - sign-in lockouts (`login-fail:<ip>`): capped; when full, entries that aren't an active lockout are evicted
 *    first (fewest failures, oldest first). If every slot is a live lockout, a new client falls back to a coarse
 *    network bucket (IPv4 /16, IPv6 /48) that still enforces a limit — never "no limit", never everyone refused;
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
        if (map.size >= cap) {
          // all live lockouts: share a coarse network bucket (kept in the never-evicted site-wide store)
          const coarse = `${key.split(":")[0]}:net:${coarseNet(key.slice(key.indexOf(":") + 1))}`;
          let c = sitewide.get(coarse);
          if (!c || c.reset < now) sitewide.set(coarse, (c = { n: 0, reset: now + windowMs, max }));
          return c;
        }
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

/** "direct"/"unknown" = no trusted client IP: every client shares one bucket, so callers use a looser limit. */
export const isSharedIp = (ip: string) => ip === "direct" || ip === "unknown" || ip === "invalid";

/** IPv6 address → its 8 hextets (validated by node:net, so malformed input never gets here). */
function hextets(v: string): string[] {
  const [head, tail = ""] = v.split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const full = v.includes("::") ? [...h, ...Array(8 - h.length - t.length).fill("0"), ...t] : h;
  return full.map((x) => parseInt(x, 16).toString(16));
}

/**
 * Normalise a client IP into a rate-limit key. IPv4 as-is; IPv4-mapped/compatible IPv6 (::ffff:1.2.3.4) → the
 * embedded IPv4 (so one client can't get two keys, and unrelated clients never collide); other IPv6 grouped by
 * /64 (one subscriber's block). Anything unparseable → a single "invalid" bucket.
 */
export function group(raw: string): string {
  const v = raw.trim().replace(/^\[|\]$/g, "").split("%")[0].slice(0, 64);
  const kind = isIP(v);
  if (kind === 4) return v;
  if (kind !== 6) return "invalid";
  const mapped = v.match(/^(?:::(?:ffff(?::0{1,4})?:)?)((?:\d{1,3}\.){3}\d{1,3})$/i);
  if (mapped && isIP(mapped[1]) === 4) return mapped[1];
  return `${hextets(v).slice(0, 4).join(":")}::/64`;
}

/** Coarser network (IPv4 /16, IPv6 /48) — overflow buckets and per-network sign-in limits. */
export function coarseNet(key: string): string {
  if (isIP(key) === 4) return key.split(".").slice(0, 2).join(".") + ".0.0/16";
  if (key.endsWith("::/64")) return key.split(":").slice(0, 3).join(":") + "::/48";
  return "other";
}

/** Failed sign-ins site-wide in the current window (drives the growing delay in `login`). */
export function siteLoginFailures(now = Date.now()): number {
  const b = sitewide.get("login-fail:*");
  return b && b.reset >= now ? b.n : 0;
}

/** In-flight counter (per instance) — caps how many of something run at once, regardless of who sends them. */
const inflight = new Map<string, number>();
export function enter(key: string, max: number): (() => void) | null {
  const n = inflight.get(key) ?? 0;
  if (n >= max) return null;
  inflight.set(key, n + 1);
  let done = false;
  return () => {
    if (done) return;
    done = true;
    inflight.set(key, Math.max(0, (inflight.get(key) ?? 1) - 1));
  };
}

export function _resetRateLimits() {
  inflight.clear();
  general.clear();
  lockouts.clear();
  sitewide.clear();
}
