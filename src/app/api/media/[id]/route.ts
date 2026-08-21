import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Media } from "@/lib/models";
import { canAccessMedia } from "@/lib/media-access";
import { readStoredObject } from "@/lib/storage";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  if (!/^[a-f\d]{24}$/i.test(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await connectDB();
  const media = await Media.findById(id);
  if (!media) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!(await canAccessMedia(media))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (media.storageProvider === "youtube" || media.youtubeId) {
    return NextResponse.json(
      { error: "YouTube media is embedded in the vault, not downloaded here" },
      { status: 400 },
    );
  }

  if (!media.storageKey || (media.storageProvider !== "r2" && media.storageProvider !== "local")) {
    return NextResponse.json({ error: "Media unavailable" }, { status: 404 });
  }

  try {
    const { body, contentType } = await readStoredObject(
      media.storageKey,
      media.storageProvider,
    );
    return new NextResponse(Buffer.from(body), {
      status: 200,
      headers: {
        "Content-Type": contentType || media.contentType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${encodeURIComponent(media.filename)}"`,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Media unavailable" }, { status: 404 });
  }
}
