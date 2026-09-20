import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import {
  assertSameOrigin,
  isAdminAuthenticated,
  isUploaderAuthenticated,
  unauthorized,
} from "@/lib/auth";
import { Event, Guest, Media } from "@/lib/models";
import { logAdminAction } from "@/lib/audit";
import { objectIdSchema } from "@/lib/validate";
import { z } from "zod";

const applySchema = z.object({
  eventId: objectIdSchema,
  updates: z
    .array(
      z.object({
        mediaId: objectIdSchema,
        guestIds: z.array(objectIdSchema).max(40),
      }),
    )
    .min(1)
    .max(2000),
  /** When true, replace tags; default merges with existing tags. */
  replace: z.boolean().optional(),
});

/**
 * Apply AI-suggested guest tags to many photos at once.
 * Matching runs in the browser; this endpoint only persists the results.
 */
export async function POST(request: Request) {
  if (!(await isUploaderAuthenticated()) && !(await isAdminAuthenticated())) {
    return unauthorized();
  }

  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: z.infer<typeof applySchema>;
  try {
    body = applySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  await connectDB();
  const event = await Event.findById(body.eventId);
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const allGuestIds = [...new Set(body.updates.flatMap((update) => update.guestIds))];
  const validGuests = await Guest.find({
    _id: { $in: allGuestIds },
    eventId: body.eventId,
  }).select("_id");
  const validSet = new Set(validGuests.map((guest) => String(guest._id)));

  const asAdmin = await isAdminAuthenticated();
  let updated = 0;
  let tagged = 0;
  let skippedPublished = 0;
  for (const update of body.updates) {
    const media = await Media.findOne({
      _id: update.mediaId,
      eventId: body.eventId,
      kind: "team_photo",
    });
    if (!media) continue;
    if (media.published && !asAdmin) {
      skippedPublished += 1;
      continue;
    }

    const nextIds = update.guestIds.filter((id) => validSet.has(id));
    if (!nextIds.length && !body.replace) continue;

    if (body.replace) {
      media.taggedGuestIds = nextIds.map((id) => id as unknown as (typeof media.taggedGuestIds)[number]);
    } else {
      const merged = new Set([
        ...(media.taggedGuestIds || []).map((id) => String(id)),
        ...nextIds,
      ]);
      media.taggedGuestIds = [...merged].map(
        (id) => id as unknown as (typeof media.taggedGuestIds)[number],
      );
    }
    await media.save();
    updated += 1;
    tagged += nextIds.length;
  }

  await logAdminAction(request, "bulk_face_tag", {
    eventId: body.eventId,
    photos: updated,
    tags: tagged,
    skippedPublished,
  });

  return NextResponse.json({ ok: true, photos: updated, tags: tagged, skippedPublished });
}
