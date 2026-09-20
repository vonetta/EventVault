import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import {
  assertSameOrigin,
  isAdminAuthenticated,
  isUploaderAuthenticated,
  unauthorized,
} from "@/lib/auth";
import { Event, Guest } from "@/lib/models";
import { createGuestByName, renameGuestById, suggestSimilarGuests } from "@/lib/guest-names";
import { createGuestNameSchema, objectIdSchema, renameGuestNameSchema } from "@/lib/validate";
import { logAdminAction } from "@/lib/audit";
import { z } from "zod";

/**
 * Names-only guest list for the photo team (no emails or ticket codes).
 * Used when tagging people in uploaded photos.
 */
export async function GET(request: Request) {
  if (!(await isUploaderAuthenticated()) && !(await isAdminAuthenticated())) {
    return unauthorized();
  }

  const eventId = new URL(request.url).searchParams.get("eventId") || "";
  if (!objectIdSchema.safeParse(eventId).success) {
    return NextResponse.json({ error: "Invalid eventId" }, { status: 400 });
  }

  await connectDB();
  const guests = await Guest.find({ eventId }).select("_id name").sort({ name: 1 }).lean();

  return NextResponse.json(
    {
      guests: guests.map((guest) => ({
        _id: String(guest._id),
        name: guest.name,
      })),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

/** Create a guest by name only when tagging someone who isn’t on the list yet. */
export async function POST(request: Request) {
  if (!(await isUploaderAuthenticated()) && !(await isAdminAuthenticated())) {
    return unauthorized();
  }

  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { eventId: string; name: string };
  try {
    body = createGuestNameSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  await connectDB();
  const event = await Event.findById(body.eventId);
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const existing = await Guest.find({ eventId: body.eventId }).select("_id name").lean();
  const suggestions = suggestSimilarGuests(
    existing.map((guest) => ({ _id: String(guest._id), name: guest.name })),
    body.name,
  );

  const result = await createGuestByName(body.eventId, body.name);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  if (result.created) {
    await logAdminAction(request, "create_guest_name", {
      name: result.guest.name,
      actor: (await isAdminAuthenticated()) ? "admin" : "uploader",
    });
  }

  return NextResponse.json({
    ...result,
    // Surface near-matches so the team can reuse a name instead of duplicating.
    suggestions: result.created ? suggestions.filter((g) => g._id !== result.guest._id) : [],
  });
}

/** Rename a tagged person. All photos using that guest ID show the new name. */
export async function PATCH(request: Request) {
  if (!(await isUploaderAuthenticated()) && !(await isAdminAuthenticated())) {
    return unauthorized();
  }

  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: z.infer<typeof renameGuestNameSchema>;
  try {
    body = renameGuestNameSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  await connectDB();
  const event = await Event.findById(body.eventId);
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const result = await renameGuestById(body.eventId, body.guestId, body.name);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  if (result.changed) {
    await logAdminAction(request, "rename_guest", {
      guestId: result.guest._id,
      name: result.guest.name,
      actor: (await isAdminAuthenticated()) ? "admin" : "uploader",
    });
  }

  return NextResponse.json(result);
}
