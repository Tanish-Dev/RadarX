/**
 * Public site + owner tools.
 * - Everyone can read the site. Owner-only pages (/settings, /design) redirect to /login unless the request carries
 *   a valid owner session (src/lib/owner.ts). Server actions check the session themselves (requireOwner).
 * - Every response gets security headers and a per-request nonce CSP: only scripts Next.js renders (with the
 *   nonce) can run, so an injected <script> or inline handler is blocked even if markup ever slipped through.
 */
import { NextResponse, type NextRequest } from "next/server";
import { OWNER_COOKIE, openDevMode, verifySession } from "./lib/owner";

const OWNER_ONLY = /^\/(settings|design)(\/|$)/;
const MAP_HOSTS = "https://tiles.openfreemap.org https://tiles.maps.eox.at";

export function buildCsp(nonce: string, dev: boolean) {
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline'`, // React style props + Tailwind; styles can't run code
    `img-src 'self' data: blob: https:`, // company logos, favicons, map tiles
    `font-src 'self' data:`,
    `connect-src 'self' ${MAP_HOSTS}${dev ? " ws: wss:" : ""}`,
    `worker-src 'self' blob:`,
    `child-src 'self' blob:`,
    `frame-src 'none'`,
    `frame-ancestors 'none'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export function securityHeaders(h: Headers, csp: string, dev: boolean) {
  h.set("Content-Security-Policy", csp);
  h.set("X-Content-Type-Options", "nosniff");
  h.set("X-Frame-Options", "DENY");
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()");
  h.set("Cross-Origin-Opener-Policy", "same-origin");
  h.set("X-DNS-Prefetch-Control", "off");
  if (!dev) h.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
}

export async function middleware(req: NextRequest) {
  const dev = process.env.NODE_ENV !== "production";

  if (OWNER_ONLY.test(req.nextUrl.pathname) && !openDevMode() && !(await verifySession(req.cookies.get(OWNER_COOKIE)?.value))) {
    const to = req.nextUrl.clone();
    to.pathname = "/login";
    to.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
    const res = NextResponse.redirect(to);
    securityHeaders(res.headers, buildCsp("none", dev), dev);
    return res;
  }

  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce, dev);
  // Next.js reads the nonce from the request's CSP header and stamps it on its own scripts
  const reqHeaders = new Headers(req.headers);
  reqHeaders.set("x-nonce", nonce);
  reqHeaders.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers: reqHeaders } });
  securityHeaders(res.headers, csp, dev);
  return res;
}

export const config = {
  // runs on every request incl. router prefetches — the owner-page lock must not be skippable with a header
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|sw.js|maplibre-gl-worker.mjs|countries-110m.json).*)"],
};
