import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import {
  assertSameOrigin,
  isAdminAuthenticated,
  isUploaderAuthenticated,
  unauthorized,
} from "@/lib/auth";
import { Media } from "@/lib/models";
import { deleteStoredObject } from "@/lib/storage";
import { logAdminAction } from "@/lib/audit";
import { objectIdSchema } from "@/lib/validate";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { z } from "zod";

/**
 * The photo team can delete their own staged uploads (team photos not yet sent
 * to guests). Once an admin has published a photo, only the admin can remove it.
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

  const limited = await rateLimit(`uploader-delete:${clientIp(request)}`, 120, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many requests. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } },
    );
  }

  let mediaId: string;
  try {
    const body = z.object({ mediaId: objectIdSchema }).parse(await request.json());
    mediaId = body.mediaId;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  await connectDB();
  const media = await Media.findById(mediaId);
  if (!media || media.kind !== "team_photo") {
    return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  }
  if (media.published) {
    return NextResponse.json(
      { error: "This photo has already been sent to guests. Ask an admin to remove it." },
      { status: 403 },
    );
  }

  if (media.storageKey && (media.storageProvider === "r2" || media.storageProvider === "local")) {
    try {
      await deleteStoredObject(media.storageKey, media.storageProvider);
    } catch {
      // Remove the record even if the blob delete fails.
    }
  }
  await Media.deleteOne({ _id: media._id });
  await logAdminAction(request, "delete_media", { mediaId, actor: "uploader" });

  return NextResponse.json({ ok: true });
}
