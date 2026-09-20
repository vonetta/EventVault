import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import {
  assertSameOrigin,
  isAdminAuthenticated,
  isUploaderAuthenticated,
  unauthorized,
} from "@/lib/auth";
import { Guest, Media } from "@/lib/models";
import { logAdminAction } from "@/lib/audit";
import { uploaderUpdateMediaSchema } from "@/lib/validate";

/**
 * Photo team (or admin) updates tags / needs-editing on a team upload.
 * Tags may be prepared while a photo still needs editing; guests only see
 * tagged photos once needsEditing is cleared.
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

  let body: {
    mediaId: string;
    taggedGuestIds?: string[];
    needsEditing?: boolean;
  };
  try {
    body = uploaderUpdateMediaSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (body.taggedGuestIds === undefined && body.needsEditing === undefined) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  await connectDB();
  const media = await Media.findById(body.mediaId);
  if (!media || media.kind !== "team_photo") {
    return NextResponse.json({ error: "Team photo not found" }, { status: 404 });
  }

  const asAdmin = await isAdminAuthenticated();
  // Match delete policy: once sent to guests, only admin can change it.
  if (media.published && !asAdmin) {
    return NextResponse.json(
      {
        error:
          "This photo has already been sent to guests. Ask an admin to change tags or move it back.",
      },
      { status: 403 },
    );
  }

  if (body.taggedGuestIds !== undefined) {
    const validGuests = await Guest.find({
      _id: { $in: body.taggedGuestIds },
      eventId: media.eventId,
    }).select("_id");
    media.taggedGuestIds = validGuests.map((guest) => guest._id);
  }

  if (body.needsEditing !== undefined) {
    media.needsEditing = body.needsEditing;
    if (body.needsEditing) {
      media.published = false;
      media.everyone = false;
      media.groupIds = [];
    }
  }

  await media.save();
  await logAdminAction(request, "update_team_media", {
    mediaId: body.mediaId,
    tags: media.taggedGuestIds?.length || 0,
    needsEditing: media.needsEditing,
    actor: asAdmin ? "admin" : "uploader",
  });

  return NextResponse.json({
    media: {
      _id: String(media._id),
      taggedGuestIds: (media.taggedGuestIds || []).map((id) => String(id)),
      needsEditing: Boolean(media.needsEditing),
    },
  });
}
