import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const GUEST_COOKIE = "ev_guest";
const ADMIN_COOKIE = "ev_admin";

function secretKey() {
  const secret = process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || "dev-only-secret";
  return new TextEncoder().encode(secret);
}

export type GuestSession = {
  guestId: string;
  eventId: string;
  tier: "vip" | "standard";
  name: string;
};

export async function setGuestSession(session: GuestSession) {
  const token = await new SignJWT(session)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secretKey());

  const jar = await cookies();
  jar.set(GUEST_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
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
    .setExpirationTime("7d")
    .sign(secretKey());

  const jar = await cookies();
  jar.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
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
