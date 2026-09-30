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
import {
  isEditTagName,
  isEditablePhotoKind,
  needsEditingPileSet,
} from "@/lib/needs-editing";
import { uploaderUpdateMediaSchema } from "@/lib/validate";

/**
 * Photo team (or admin) updates tags / needs-editing on a still.
 * A guest named "Edit" stays as a visible tag and is used by gallery filters
 * to park the photo under Needs editing (not converted into needsEditing).
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
  if (!media || !isEditablePhotoKind(media.kind)) {
    return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  }

  const asAdmin = await isAdminAuthenticated();
  let hasEditTag = false;

  if (body.taggedGuestIds !== undefined) {
    if (!asAdmin && media.kind !== "team_photo") {
      return NextResponse.json(
        {
          error:
            "This photo has already been sent to guests. Ask an admin to change tags or move it back.",
        },
        { status: 403 },
      );
    }
    const validGuests = await Guest.find({
      _id: { $in: body.taggedGuestIds },
      eventId: media.eventId,
    }).select("_id name");
    media.taggedGuestIds = validGuests.map((guest) => guest._id);
    hasEditTag = validGuests.some((guest) => isEditTagName(guest.name || ""));
  }

  const pullingToEdit = body.needsEditing === true;
  if (media.published && !asAdmin && !pullingToEdit) {
    return NextResponse.json(
      {
        error:
          "This photo has already been sent to guests. Ask an admin to change tags or move it back.",
      },
      { status: 403 },
    );
  }

  if (body.needsEditing !== undefined) {
    if (body.needsEditing) {
      Object.assign(media, needsEditingPileSet());
    } else {
      media.needsEditing = false;
      media.kind = "team_photo";
      media.published = false;
      media.everyone = false;
      media.groupIds = [];
    }
  }

  await media.save();

  if (!hasEditTag && (media.taggedGuestIds || []).length) {
    const tagged = await Guest.find({
      _id: { $in: media.taggedGuestIds || [] },
      eventId: media.eventId,
    })
      .select("name")
      .lean();
    hasEditTag = tagged.some((guest) => isEditTagName(guest.name || ""));
  }

  await logAdminAction(request, "update_team_media", {
    mediaId: body.mediaId,
    tags: media.taggedGuestIds?.length || 0,
    needsEditing: media.needsEditing,
    kind: media.kind,
    hasEditTag,
    actor: asAdmin ? "admin" : "uploader",
  });

  return NextResponse.json({
    media: {
      _id: String(media._id),
      taggedGuestIds: (media.taggedGuestIds || []).map((id) => String(id)),
      needsEditing: Boolean(media.needsEditing),
      kind: media.kind,
      hasEditTag,
    },
  });
}
