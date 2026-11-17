/**
 * Password gate for the hosted dashboard. Set DASHBOARD_PASSWORD (Vercel env) and every page, API
 * route and server action requires HTTP Basic auth (any username, that password). Unset locally →
 * open, as before. Server actions are POSTs to page routes, so they pass through here too.
 */
import { NextResponse, type NextRequest } from "next/server";

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function middleware(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return NextResponse.next();
  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const pass = decoded.slice(decoded.indexOf(":") + 1);
      if (safeEqual(pass, password)) return NextResponse.next();
    } catch {
      /* malformed header → challenge */
    }
  }
  return new NextResponse("Authentication required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="RadarX", charset="UTF-8"' } });
}

export const config = {
  // everything except static assets (the browser re-sends Basic credentials for those anyway)
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|maplibre-gl-worker.mjs).*)"],
};
