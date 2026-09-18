import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { isAdminAuthenticated, isUploaderAuthenticated, unauthorized } from "@/lib/auth";
import { Media } from "@/lib/models";
import { mediaProxyUrl } from "@/lib/storage";
import { objectIdSchema } from "@/lib/validate";

/** Staged team photos for an event (the shared "Main gallery" the team manages). */
export async function GET(request: Request) {
  if (!(await isUploaderAuthenticated()) && !(await isAdminAuthenticated())) {
    return unauthorized();
  }

  const eventId = new URL(request.url).searchParams.get("eventId") || "";
  if (!objectIdSchema.safeParse(eventId).success) {
    return NextResponse.json({ error: "Invalid eventId" }, { status: 400 });
  }

  await connectDB();
  const media = await Media.find({
    eventId,
    kind: "team_photo",
    published: false,
  })
    .sort({ createdAt: -1 })
    .lean();

  return NextResponse.json(
    {
      media: media.map((item) => ({
        id: String(item._id),
        title: item.title || item.filename || "Photo",
        contentType: item.contentType || "image/jpeg",
        url: mediaProxyUrl(String(item._id)),
        uploadedByName: item.uploadedByName || "",
        createdAt: item.createdAt,
      })),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
