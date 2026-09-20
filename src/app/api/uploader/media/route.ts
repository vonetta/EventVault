import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { isAdminAuthenticated, isUploaderAuthenticated, unauthorized } from "@/lib/auth";
import { Guest, Media } from "@/lib/models";
import { mediaProxyUrl } from "@/lib/storage";
import { objectIdSchema } from "@/lib/validate";

/** Team photos for an event — ready Main gallery + Needs editing bucket. */
export async function GET(request: Request) {
  if (!(await isUploaderAuthenticated()) && !(await isAdminAuthenticated())) {
    return unauthorized();
  }

  const eventId = new URL(request.url).searchParams.get("eventId") || "";
  if (!objectIdSchema.safeParse(eventId).success) {
    return NextResponse.json({ error: "Invalid eventId" }, { status: 400 });
  }

  await connectDB();
  const [media, guests] = await Promise.all([
    Media.find({
      eventId,
      kind: "team_photo",
      published: false,
    })
      .sort({ createdAt: -1 })
      .lean(),
    Guest.find({ eventId }).select("_id name").lean(),
  ]);

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

  const ready = media.filter((item) => !item.needsEditing).map(mapPhoto);
  const needsEditing = media.filter((item) => item.needsEditing).map(mapPhoto);

  return NextResponse.json(
    {
      media: ready,
      needsEditing,
      // Keep a flat list for callers that still expect `media` only.
      all: [...needsEditing, ...ready],
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
