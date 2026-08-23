import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  destroySession,
  expiredCookieOptions,
  SESSION_COOKIE,
} from "@/lib/auth/sessions";

export const dynamic = "force-dynamic";

/**
 * Signing out. POST only — a GET would let any page on the internet sign
 * somebody out by embedding an image.
 */
export async function POST(request: Request) {
  const store = await cookies();
  destroySession(store.get(SESSION_COOKIE)?.value);

  const response = NextResponse.redirect(new URL("/login", request.url), {
    status: 303,
  });
  response.cookies.set(SESSION_COOKIE, "", expiredCookieOptions());
  return response;
}
