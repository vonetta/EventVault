import { timingSafeEqual } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const GUEST_COOKIE = "ev_guest";
export const ADMIN_COOKIE = "ev_admin";

function requireSessionSecret() {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret || secret === "dev-only-secret" || secret.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "SESSION_SECRET must be set to a random string of at least 32 characters",
      );
    }
    return new TextEncoder().encode(
      secret && secret.length >= 16 ? secret : "local-dev-only-session-secret!!",
    );
  }
  return new TextEncoder().encode(secret);
}

export function secretKey() {
  return requireSessionSecret();
}

/** Constant-time string compare for passwords. */
export function secureEqual(a: string, b: string) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

export type GuestSession = {
  guestId: string;
  eventId: string;
  tier: "vip" | "standard";
  name: string;
  sv: number;
  adminPreview?: boolean;
};

export async function setGuestSession(
  session: GuestSession,
  options?: { adminPreview?: boolean },
) {
  const payload: GuestSession = {
    ...session,
    sv: session.sv ?? 0,
    adminPreview: options?.adminPreview ?? session.adminPreview,
  };
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(secretKey());

  const jar = await cookies();
  jar.set(GUEST_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function clearGuestSession() {
  const jar = await cookies();
  jar.delete(GUEST_COOKIE);
}

export async function getGuestSession(): Promise<GuestSession | null> {
  const jar = await cookies();
  const token = jar.get(GUEST_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload as unknown as GuestSession;
  } catch {
    return null;
  }
}

export async function setAdminSession() {
  const token = await new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secretKey());

  const jar = await cookies();
  jar.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

export async function clearAdminSession() {
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE);
}

export async function isAdminAuthenticated() {
  const jar = await cookies();
  const token = jar.get(ADMIN_COOKIE)?.value;
  if (!token) return false;

  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload.role === "admin";
  } catch {
    return false;
  }
}

export function unauthorized(message = "Unauthorized") {
  return NextResponse.json({ error: message }, { status: 401 });
}

function hostsMatch(requestHost: string, candidate: string) {
  try {
    return new URL(candidate).host === requestHost;
  } catch {
    return false;
  }
}

/** Reject cross-site POSTs that still send cookies (defense in depth). */
export function assertSameOrigin(request: Request) {
  const host = request.headers.get("host");
  if (!host) return;

  const origin = request.headers.get("origin");
  if (origin) {
    if (!hostsMatch(host, origin)) {
      throw new Error("Cross-origin request blocked");
    }
    return;
  }

  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD") {
    return;
  }

  const referer = request.headers.get("referer");
  if (referer && hostsMatch(host, referer)) {
    return;
  }

  throw new Error("Cross-origin request blocked");
}
