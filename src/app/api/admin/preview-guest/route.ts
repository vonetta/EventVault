import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import {
  assertSameOrigin,
  isAdminAuthenticated,
  setGuestSession,
  unauthorized,
} from "@/lib/auth";
import { Guest } from "@/lib/models";
import { guestSessionPayload } from "@/lib/guest-session";
import { objectIdSchema } from "@/lib/validate";

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) return unauthorized();

  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let guestId: string;
  try {
    const body = await request.json();
    guestId = objectIdSchema.parse(body.guestId);
  } catch {
    return NextResponse.json({ error: "Invalid guest id" }, { status: 400 });
  }

  await connectDB();
  const guest = await Guest.findById(guestId);
  if (!guest) {
    return NextResponse.json({ error: "Guest not found" }, { status: 404 });
  }

  await setGuestSession(
    { ...guestSessionPayload(guest), adminPreview: true },
    { adminPreview: true },
  );

  return NextResponse.json({
    ok: true,
    name: guest.name,
    tier: guest.tier,
  });
}
