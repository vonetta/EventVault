import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { ADMIN_COOKIE, isAdminJwtPayload } from "@/lib/admin-token";

async function verifyAdminToken(token: string) {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret || secret.length < 32) return false;

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    return isAdminJwtPayload(payload);
  } catch {
    return false;
  }
}

/** Soft gate: redirect unauthenticated or expired admin sessions. */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/login")) {
    const token = request.cookies.get(ADMIN_COOKIE)?.value;
    if (!token || !(await verifyAdminToken(token))) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
