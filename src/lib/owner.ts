/**
 * Owner session — pure Web Crypto so it runs in middleware (edge) and in server code alike.
 *
 * - OWNER_PASSWORD (or the older DASHBOARD_PASSWORD) unlocks owner tools: Settings, resume, alert rules,
 *   Telegram, add company, Poll now, and the owner's own stars / pipeline in the database.
 * - Secure by default: on a hosted/production build with no password set, NOBODY is the owner. Only a local
 *   `next dev` without a password treats everyone as the owner (as before).
 * - The session cookie is `v1.<expiry>.<HMAC-SHA256>`; the key is derived from SESSION_SECRET (optional) +
 *   the password, so changing the password signs every session out.
 */
export const OWNER_COOKIE = "rx_owner";
export const SESSION_DAYS = 30;

const enc = new TextEncoder();

export function ownerPassword(): string | null {
  return process.env.OWNER_PASSWORD || process.env.DASHBOARD_PASSWORD || null;
}

/** Local development without a password: owner tools stay open (nothing is exposed to the internet). */
export function openDevMode(): boolean {
  return !ownerPassword() && process.env.NODE_ENV !== "production" && !process.env.VERCEL;
}

async function key(): Promise<CryptoKey | null> {
  const pw = ownerPassword();
  if (!pw) return null;
  const material = `radarx-session|${process.env.SESSION_SECRET ?? ""}|${pw}`;
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(material));
  return crypto.subtle.importKey("raw", digest, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

function fromB64url(s: string): Uint8Array | null {
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

export async function createSession(now = Date.now()): Promise<string | null> {
  const k = await key();
  if (!k) return null;
  const body = `v1.${now + SESSION_DAYS * 86_400_000}`;
  return `${body}.${b64url(await crypto.subtle.sign("HMAC", k, enc.encode(body)))}`;
}

/** Constant-time check (crypto.subtle.verify) + expiry. */
export async function verifySession(value: string | undefined | null, now = Date.now()): Promise<boolean> {
  if (!value || value.length > 200) return false;
  const m = value.match(/^(v1\.(\d{10,16}))\.([A-Za-z0-9_-]{20,})$/);
  if (!m || Number(m[2]) < now) return false;
  const k = await key();
  const sig = fromB64url(m[3]);
  if (!k || !sig) return false;
  return crypto.subtle.verify("HMAC", k, sig as BufferSource, enc.encode(m[1]));
}

/** Constant-time password comparison (hash both sides first so length doesn't leak). */
export async function passwordMatches(input: string): Promise<boolean> {
  const pw = ownerPassword();
  if (!pw || typeof input !== "string" || input.length > 512) return false;
  const [a, b] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(input)), crypto.subtle.digest("SHA-256", enc.encode(pw))]);
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

/** Only same-site relative paths survive as a post-login redirect ("//evil.com" and "/\\evil" are rejected). */
export function safeNext(next: unknown): string {
  const s = typeof next === "string" ? next : "";
  return /^\/(?![\/\\])[^\s]*$/.test(s) && s.length < 300 ? s : "/";
}
