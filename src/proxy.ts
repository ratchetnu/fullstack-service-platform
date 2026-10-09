import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/server/auth/cookie-name";

/**
 * A convenience, not a security boundary: visitors with no session cookie are
 * sent straight to the sign-in page, remembering where they were going.
 * Whether a session is valid, and what it may do, is decided on the server by
 * the page and the service layer.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/dashboard/:path*", "/bookings/:path*", "/customers/:path*"],
};
