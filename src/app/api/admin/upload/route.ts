import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { isAdminAuthenticated, unauthorized } from "@/lib/auth";
import { Media } from "@/lib/models";
import { storeFile } from "@/lib/storage";

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) return unauthorized();

  const form = await request.formData();
  const file = form.get("file");
  const eventId = String(form.get("eventId") || "");
  const kindRaw = String(form.get("kind") || "");
  const title = String(form.get("title") || "");
  const guestId = String(form.get("guestId") || "") || null;
  const sessionId = String(form.get("sessionId") || "") || null;

  if (!(file instanceof File) || !eventId || !kindRaw) {
    return NextResponse.json({ error: "file, eventId, and kind are required" }, { status: 400 });
  }

  const allowedKinds = ["personal_photo", "group_photo", "session_video"] as const;
  type MediaKind = (typeof allowedKinds)[number];
  if (!allowedKinds.includes(kindRaw as MediaKind)) {
    return NextResponse.json({ error: "Invalid media kind" }, { status: 400 });
  }
  const kind = kindRaw as MediaKind;

  if (kind === "personal_photo" && !guestId) {
    return NextResponse.json({ error: "personal_photo requires guestId" }, { status: 400 });
  }

  if (kind === "session_video" && !sessionId) {
    return NextResponse.json({ error: "session_video requires sessionId" }, { status: 400 });
  }

  await connectDB();
  const stored = await storeFile(file, `events/${eventId}/${kind}`);

  const media = await Media.create({
    eventId,
    kind,
    title: title || file.name,
    filename: file.name,
    contentType: file.type || "application/octet-stream",
    size: file.size,
    storageKey: stored.storageKey,
    storageProvider: stored.storageProvider,
    guestId,
    sessionId,
  });

  return NextResponse.json({ media });
}
