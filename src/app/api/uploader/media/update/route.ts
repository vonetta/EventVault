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
  isEditablePhotoKind,
  needsEditingPileSet,
  partitionEditTagGuests,
} from "@/lib/needs-editing";
import { uploaderUpdateMediaSchema } from "@/lib/validate";

/**
 * Photo team (or admin) updates tags / needs-editing on a still.
 * A guest named "Edit" is a workflow tag: move the photo to Needs editing
 * and strip that name so it does not show as a person under the thumbnail.
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
  let movedByEditTag = false;

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
    const { editGuests, personGuests } = partitionEditTagGuests(validGuests);
    media.taggedGuestIds = personGuests.map((guest) => guest._id);
    if (editGuests.length) {
      Object.assign(media, needsEditingPileSet());
      movedByEditTag = true;
    }
  }

  // Match delete policy: once sent to guests, only admin can change it —
  // unless we're pulling it back into Needs editing (button or Edit tag).
  const pullingToEdit = body.needsEditing === true || movedByEditTag;
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
  await logAdminAction(request, "update_team_media", {
    mediaId: body.mediaId,
    tags: media.taggedGuestIds?.length || 0,
    needsEditing: media.needsEditing,
    kind: media.kind,
    movedByEditTag,
    actor: asAdmin ? "admin" : "uploader",
  });

  return NextResponse.json({
    media: {
      _id: String(media._id),
      taggedGuestIds: (media.taggedGuestIds || []).map((id) => String(id)),
      needsEditing: Boolean(media.needsEditing),
      kind: media.kind,
      movedByEditTag,
    },
  });
}
