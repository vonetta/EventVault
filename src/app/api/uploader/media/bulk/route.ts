import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import {
  assertSameOrigin,
  isAdminAuthenticated,
  isUploaderAuthenticated,
  unauthorized,
} from "@/lib/auth";
import { Media } from "@/lib/models";
import { logAdminAction } from "@/lib/audit";
import { objectIdSchema } from "@/lib/validate";
import { z } from "zod";

const bulkSchema = z.object({
  eventId: objectIdSchema,
  updates: z
    .array(
      z.object({
        mediaId: objectIdSchema,
        needsEditing: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(2000),
});

/**
 * Bulk-update needs-editing flags after client-side quality / duplicate review.
 * Once a photo is published to guests, only admins can change it.
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

  let body: z.infer<typeof bulkSchema>;
  try {
    body = bulkSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  await connectDB();
  const asAdmin = await isAdminAuthenticated();
  let updated = 0;
  let skippedPublished = 0;

  for (const update of body.updates) {
    if (update.needsEditing === undefined) continue;
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

    media.needsEditing = update.needsEditing;
    if (update.needsEditing) {
      media.published = false;
      media.everyone = false;
      media.groupIds = [];
    }
    await media.save();
    updated += 1;
  }

  await logAdminAction(request, "bulk_media_quality", {
    eventId: body.eventId,
    photos: updated,
    skippedPublished,
  });

  return NextResponse.json({ ok: true, photos: updated, skippedPublished });
}
