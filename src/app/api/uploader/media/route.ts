import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { isAdminAuthenticated, isUploaderAuthenticated, unauthorized } from "@/lib/auth";
import { Guest, Media } from "@/lib/models";
import { editGuestIdsFrom } from "@/lib/needs-editing";
import { mediaProxyUrl } from "@/lib/storage";
import { objectIdSchema } from "@/lib/validate";

const DEFAULT_PAGE = 120;
const MAX_PAGE = 300;

/** Team photos for an event — ready Main gallery + Needs editing bucket. */
export async function GET(request: Request) {
  if (!(await isUploaderAuthenticated()) && !(await isAdminAuthenticated())) {
    return unauthorized();
  }

  const url = new URL(request.url);
  const eventId = url.searchParams.get("eventId") || "";
  if (!objectIdSchema.safeParse(eventId).success) {
    return NextResponse.json({ error: "Invalid eventId" }, { status: 400 });
  }

  const bucketParam = url.searchParams.get("bucket") || "all";
  const bucket =
    bucketParam === "ready" || bucketParam === "editing" || bucketParam === "all"
      ? bucketParam
      : "all";

  const rawLimit = Number(url.searchParams.get("limit") || DEFAULT_PAGE);
  const limit = Math.min(
    MAX_PAGE,
    Math.max(1, Number.isFinite(rawLimit) ? Math.floor(rawLimit) : DEFAULT_PAGE),
  );
  const cursor = url.searchParams.get("cursor") || "";
  const cursorOk = !cursor || objectIdSchema.safeParse(cursor).success;
  if (!cursorOk) {
    return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
  }

  await connectDB();

  // Put back Edit tags that an earlier migrate stripped (no re-tagging needed).
  const { restoreStrippedEditTags } = await import("@/lib/restore-edit-tags");
  await restoreStrippedEditTags(eventId);

  const guests = await Guest.find({ eventId }).select("_id name").lean();
  const editIds = editGuestIdsFrom(guests);

  const base: Record<string, unknown> = {
    eventId,
    kind: "team_photo",
    published: false,
  };
  if (cursor) {
    base._id = { $lt: new mongoose.Types.ObjectId(cursor) };
  }

  // Main gallery: not flagged needsEditing and not tagged Edit.
  // Needs editing: flagged OR tagged Edit (Edit tag stays visible on the photo).
  let filter: Record<string, unknown> = { ...base };
  if (bucket === "ready") {
    filter = {
      ...base,
      needsEditing: false,
      ...(editIds.length ? { taggedGuestIds: { $nin: editIds } } : {}),
    };
  } else if (bucket === "editing") {
    filter = {
      ...base,
      $or: [
        { needsEditing: true },
        ...(editIds.length ? [{ taggedGuestIds: { $in: editIds } }] : []),
      ],
    };
    // If there is no Edit guest yet, editing is just the needsEditing flag.
    if (!editIds.length) {
      filter = { ...base, needsEditing: true };
    }
  }

  const readyFilter = {
    eventId,
    kind: "team_photo" as const,
    published: false,
    needsEditing: false,
    ...(editIds.length ? { taggedGuestIds: { $nin: editIds } } : {}),
  };
  const editingFilter = editIds.length
    ? {
        eventId,
        kind: "team_photo" as const,
        published: false,
        $or: [{ needsEditing: true }, { taggedGuestIds: { $in: editIds } }],
      }
    : {
        eventId,
        kind: "team_photo" as const,
        published: false,
        needsEditing: true,
      };

  const [media, totalReady, totalEditing] = await Promise.all([
    Media.find(filter)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .lean(),
    Media.countDocuments(readyFilter),
    Media.countDocuments(editingFilter),
  ]);

  const hasMore = media.length > limit;
  const page = hasMore ? media.slice(0, limit) : media;
  const nextCursor = hasMore ? String(page[page.length - 1]?._id || "") : null;

  const nameById = new Map(guests.map((guest) => [String(guest._id), guest.name]));
  const editIdSet = new Set(editIds);

  function mapPhoto(item: (typeof media)[number]) {
    const taggedGuestIds = (item.taggedGuestIds || []).map((id) => String(id));
    const hasEditTag = taggedGuestIds.some((id) => editIdSet.has(id));
    const hasCleanupPreview = Boolean(item.cleanupPreviewKey);
    return {
      id: String(item._id),
      title: item.title || item.filename || "Photo",
      contentType: item.contentType || "image/jpeg",
      url: mediaProxyUrl(String(item._id)),
      uploadedByName: item.uploadedByName || "",
      needsEditing: Boolean(item.needsEditing),
      hasEditTag,
      hasCleanupPreview,
      cleanupPreviewUrl: hasCleanupPreview
        ? `${mediaProxyUrl(String(item._id))}?variant=cleanup`
        : null,
      cleanupPreviewAt: item.cleanupPreviewAt || null,
      taggedGuestIds,
      taggedNames: taggedGuestIds.map((id) => nameById.get(id) || "Unknown").filter(Boolean),
      createdAt: item.createdAt,
    };
  }

  const mapped = page.map(mapPhoto);
  // For bucket=all, split client-side using the same rules.
  const ready = mapped.filter((item) => !item.needsEditing && !item.hasEditTag);
  const needsEditing = mapped.filter((item) => item.needsEditing || item.hasEditTag);

  return NextResponse.json(
    {
      media: bucket === "editing" ? [] : bucket === "ready" ? mapped : ready,
      needsEditing: bucket === "ready" ? [] : bucket === "editing" ? mapped : needsEditing,
      all: mapped,
      page: {
        limit,
        hasMore,
        nextCursor,
        totalReady,
        totalEditing,
        total: totalReady + totalEditing,
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
