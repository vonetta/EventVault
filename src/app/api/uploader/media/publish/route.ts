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
 * Skips Needs editing and already-published items.
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
  let skippedEditing = 0;
  let skippedPublished = 0;
  const readyIds: typeof media = [];

  for (const item of media) {
    if (item.needsEditing) {
      skippedEditing += 1;
      continue;
    }
    if (item.published) {
      skippedPublished += 1;
      continue;
    }
    readyIds.push(item);
  }

  if (readyIds.length) {
    await Media.updateMany(
      { _id: { $in: readyIds.map((item) => item._id) } },
      { $set: { published: true, everyone: true, groupIds: [] } },
    );
    sent = readyIds.length;
  }

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
