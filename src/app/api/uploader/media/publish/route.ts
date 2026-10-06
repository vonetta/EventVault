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
import {
  editGuestIdsFrom,
  showsInNeedsEditing,
} from "@/lib/needs-editing";
import { objectIdSchema } from "@/lib/validate";
import { z } from "zod";

const publishSchema = z.object({
  eventId: objectIdSchema,
  mediaIds: z.array(objectIdSchema).min(1).max(2000),
  /** Uploader publish is everyone-only (free event gallery). */
  everyone: z.literal(true),
});

/**
 * Publish staged team photos to Everyone (free for all guests).
 * Used after AI group-photo review on the upload page.
 * Skips Needs editing / Edit-tagged and already-published items — those stay
 * out of Whole event until Mark ready / Remove Edit.
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

  let body: z.infer<typeof publishSchema>;
  try {
    body = publishSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  await connectDB();
  const event = await Event.findById(body.eventId);
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const guests = await Guest.find({ eventId: body.eventId }).select("_id name").lean();
  const editIds = editGuestIdsFrom(guests);

  const media = await Media.find({
    _id: { $in: body.mediaIds },
    eventId: body.eventId,
    kind: "team_photo",
  });

  let sent = 0;
  let skippedEditing = 0;
  let skippedPublished = 0;
  const readyIds: typeof media = [];

  for (const item of media) {
    if (item.published) {
      skippedPublished += 1;
      continue;
    }
    if (showsInNeedsEditing(item, editIds)) {
      skippedEditing += 1;
      continue;
    }
    readyIds.push(item);
  }

  if (readyIds.length) {
    await Media.updateMany(
      { _id: { $in: readyIds.map((item) => item._id) } },
      {
        $set: {
          kind: "event_photo",
          published: true,
          everyone: true,
          needsEditing: false,
          groupIds: [],
          // Group shots are free Whole event — clear person tags so they do not
          // land in watermarked Photos of you for everyone in the frame.
          taggedGuestIds: [],
        },
      },
    );
    sent = readyIds.length;
  }

  // Integrity: published whole-event stills should be free for everyone.
  // Never clear needsEditing here — editing photos must stay out of the gallery.
  await Media.updateMany(
    {
      eventId: body.eventId,
      kind: "event_photo",
      needsEditing: { $ne: true },
      everyone: { $ne: true },
    },
    { $set: { everyone: true, published: true } },
  );

  await logAdminAction(request, "publish_group_photos_everyone", {
    eventId: body.eventId,
    sent,
    skippedEditing,
    skippedPublished,
    actor: (await isAdminAuthenticated()) ? "admin" : "uploader",
  });

  return NextResponse.json({
    ok: true,
    sent,
    skippedEditing,
    skippedPublished,
  });
}
