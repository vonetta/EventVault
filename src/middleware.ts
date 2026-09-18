import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { ADMIN_COOKIE, isAdminJwtPayload } from "@/lib/admin-token";
import { UPLOADER_COOKIE, isUploaderJwtPayload } from "@/lib/uploader-token";

function sessionSecret() {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret || secret.length < 32) return null;
  return new TextEncoder().encode(secret);
}

async function verifyAdminToken(token: string) {
  const secret = sessionSecret();
  if (!secret) return false;
  try {
    const { payload } = await jwtVerify(token, secret);
    return isAdminJwtPayload(payload);
  } catch {
    return false;
  }
}

async function verifyUploaderToken(token: string) {
  const secret = sessionSecret();
  if (!secret) return false;
  try {
    const { payload } = await jwtVerify(token, secret);
    return isUploaderJwtPayload(payload);
  } catch {
    return false;
  }
}

/** Soft gate: redirect unauthenticated or expired admin/uploader sessions. */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/login")) {
    const token = request.cookies.get(ADMIN_COOKIE)?.value;
    if (!token || !(await verifyAdminToken(token))) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
  }

  if (pathname.startsWith("/upload") && !pathname.startsWith("/upload/login")) {
    const uploaderToken = request.cookies.get(UPLOADER_COOKIE)?.value;
    const adminToken = request.cookies.get(ADMIN_COOKIE)?.value;
    const allowed =
      (uploaderToken && (await verifyUploaderToken(uploaderToken))) ||
      (adminToken && (await verifyAdminToken(adminToken)));
    if (!allowed) {
      return NextResponse.redirect(new URL("/upload/login", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/upload", "/upload/:path*"],
};
