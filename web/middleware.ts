import { NextResponse, type NextRequest } from "next/server";

/**
 * A cheap redirect for people who are obviously not signed in.
 *
 * This is NOT where authorisation happens. Middleware runs before the database
 * is reachable, so it can only see whether a session cookie exists — not
 * whether it resolves to a real, enabled account, and not whether that account
 * owns the thing being requested. Every protected page and route handler calls
 * `requireUser`, `requireAdmin` or an ownership check of its own; this only
 * saves an unauthenticated visitor from rendering a page to be redirected.
 */

const SESSION_COOKIE = "hsc_se_session";

/** Reachable without a session. */
const PUBLIC_PATHS = ["/login", "/setup", "/logout"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.next();
  }

  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  // API callers get a status, not a redirect to an HTML page.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const target = request.nextUrl.clone();
  target.pathname = "/login";
  target.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(target);
}

export const config = {
  matcher: [
    /*
     * Everything except Next's own assets and the public files the exam needs
     * before a session is established.
     */
    "/((?!_next/static|_next/image|favicon.ico|pyodide|monaco|sqljs|python-worker.js).*)",
  ],
};
