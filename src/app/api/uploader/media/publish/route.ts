import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import {
  assertSameOrigin,
  isAdminAuthenticated,
  isUploaderAuthenticated,
  unauthorized,
} from "@/lib/auth";
import { Event, Media } from "@/lib/models";
import { logAdminAction } from "@/lib/audit";
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
 *
 * Intentionally allows Needs editing / Edit-tagged shots: Group AI is how
 * crowd photos leave the edit pile and land in free Whole event. Already-
 * published items are skipped.
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

  const media = await Media.find({
    _id: { $in: body.mediaIds },
    eventId: body.eventId,
    kind: "team_photo",
  });

  let sent = 0;
  let skippedPublished = 0;
  let clearedEditing = 0;
  const readyIds: typeof media = [];

  for (const item of media) {
    if (item.published) {
      skippedPublished += 1;
      continue;
    }
    if (item.needsEditing) {
      clearedEditing += 1;
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
          // Group shots are free Whole event — clear person tags (and Edit) so
          // they do not land in watermarked Photos of you for everyone in frame.
          taggedGuestIds: [],
        },
      },
    );
    sent = readyIds.length;
  }

  // Integrity: any event_photo for this event should be free for everyone.
  await Media.updateMany(
    {
      eventId: body.eventId,
      kind: "event_photo",
      everyone: { $ne: true },
    },
    { $set: { everyone: true, published: true, needsEditing: false } },
  );

  await logAdminAction(request, "publish_group_photos_everyone", {
    eventId: body.eventId,
    sent,
    clearedEditing,
    skippedPublished,
    actor: (await isAdminAuthenticated()) ? "admin" : "uploader",
  });

  return NextResponse.json({
    ok: true,
    sent,
    clearedEditing,
    skippedPublished,
    // Keep skippedEditing for older clients; Group AI no longer skips the pile.
    skippedEditing: 0,
  });
}
