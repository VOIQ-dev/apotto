import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const BACKOFFICE_AUTH_COOKIE = "backoffice_auth";

export function isBackofficeAuthenticated(request: NextRequest): boolean {
  return request.cookies.get(BACKOFFICE_AUTH_COOKIE)?.value === "1";
}

export function requireBackofficeAuth(
  request: NextRequest,
): NextResponse | null {
  if (!isBackofficeAuthenticated(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

export function setBackofficeAuthCookie(response: NextResponse) {
  response.cookies.set(BACKOFFICE_AUTH_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
}

export function clearBackofficeAuthCookie(response: NextResponse) {
  response.cookies.set(BACKOFFICE_AUTH_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
