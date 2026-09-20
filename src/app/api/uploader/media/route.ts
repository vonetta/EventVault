import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { isAdminAuthenticated, isUploaderAuthenticated, unauthorized } from "@/lib/auth";
import { Guest, Media } from "@/lib/models";
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

  const filter: {
    eventId: string;
    kind: "team_photo";
    published: boolean;
    needsEditing?: boolean;
    _id?: { $lt: mongoose.Types.ObjectId };
  } = {
    eventId,
    kind: "team_photo",
    published: false,
  };
  if (bucket === "ready") filter.needsEditing = false;
  if (bucket === "editing") filter.needsEditing = true;
  if (cursor) {
    // ObjectId order ≈ insert time; walk older pages with $lt while sorting _id desc.
    filter._id = { $lt: new mongoose.Types.ObjectId(cursor) };
  }

  const [media, guests, totalReady, totalEditing] = await Promise.all([
    Media.find(filter)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .lean(),
    Guest.find({ eventId }).select("_id name").lean(),
    Media.countDocuments({
      eventId,
      kind: "team_photo",
      published: false,
      needsEditing: false,
    }),
    Media.countDocuments({
      eventId,
      kind: "team_photo",
      published: false,
      needsEditing: true,
    }),
  ]);

  const hasMore = media.length > limit;
  const page = hasMore ? media.slice(0, limit) : media;
  const nextCursor = hasMore ? String(page[page.length - 1]?._id || "") : null;

  const nameById = new Map(guests.map((guest) => [String(guest._id), guest.name]));

  function mapPhoto(item: (typeof media)[number]) {
    const taggedGuestIds = (item.taggedGuestIds || []).map((id) => String(id));
    return {
      id: String(item._id),
      title: item.title || item.filename || "Photo",
      contentType: item.contentType || "image/jpeg",
      url: mediaProxyUrl(String(item._id)),
      uploadedByName: item.uploadedByName || "",
      needsEditing: Boolean(item.needsEditing),
      taggedGuestIds,
      taggedNames: taggedGuestIds.map((id) => nameById.get(id) || "Unknown").filter(Boolean),
      createdAt: item.createdAt,
    };
  }

  const mapped = page.map(mapPhoto);
  const ready = mapped.filter((item) => !item.needsEditing);
  const needsEditing = mapped.filter((item) => item.needsEditing);

  return NextResponse.json(
    {
      media: ready,
      needsEditing,
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
