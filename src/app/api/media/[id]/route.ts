import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Media } from "@/lib/models";
import { getMediaAccessLevel } from "@/lib/media-access";
import { openStoredObjectStream, readStoredObject } from "@/lib/storage";
import { makeWatermarkedPreview } from "@/lib/preview";
import { Readable } from "node:stream";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const asDownload = new URL(request.url).searchParams.get("download") === "1";
  if (!/^[a-f\d]{24}$/i.test(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await connectDB();
  const media = await Media.findById(id);
  if (!media) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const access = await getMediaAccessLevel(media);
  if (access === "none") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Locked individual photo: block the real download, serve a watermarked preview.
  if (access === "preview") {
    if (asDownload) {
      return NextResponse.json(
        { error: "Unlock your individual photos to download them.", code: "payment_required" },
        { status: 402 },
      );
    }
    if (
      media.storageKey &&
      (media.storageProvider === "r2" || media.storageProvider === "local")
    ) {
      try {
        const { body } = await readStoredObject(media.storageKey, media.storageProvider);
        const preview = await makeWatermarkedPreview(Buffer.from(body), "PREVIEW");
        return new Response(new Uint8Array(preview), {
          status: 200,
          headers: {
            "Content-Type": "image/jpeg",
            "Cache-Control": "private, no-store, no-cache, must-revalidate",
            Pragma: "no-cache",
            Vary: "Cookie",
            "X-Content-Type-Options": "nosniff",
          },
        });
      } catch {
        return NextResponse.json({ error: "Preview unavailable" }, { status: 404 });
      }
    }
    return NextResponse.json({ error: "Preview unavailable" }, { status: 404 });
  }

  if (media.storageProvider === "youtube" || media.youtubeId || media.youtubePlaylistId) {
    return NextResponse.json(
      { error: "YouTube media is embedded in the vault, not downloaded here" },
      { status: 400 },
    );
  }

  if (!media.storageKey || (media.storageProvider !== "r2" && media.storageProvider !== "local")) {
    return NextResponse.json({ error: "Media unavailable" }, { status: 404 });
  }

  try {
    const { stream, contentType, contentLength } = await openStoredObjectStream(
      media.storageKey,
      media.storageProvider,
    );

    const headers: Record<string, string> = {
      "Content-Type": contentType || media.contentType || "application/octet-stream",
      "Content-Disposition": `${asDownload ? "attachment" : "inline"}; filename="${encodeURIComponent(media.filename)}"`,
      "Cache-Control": "private, no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
      Vary: "Cookie",
      "X-Content-Type-Options": "nosniff",
    };
    if (contentLength) {
      headers["Content-Length"] = String(contentLength);
    }

    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 200,
      headers,
    });
  } catch {
    return NextResponse.json({ error: "Media unavailable" }, { status: 404 });
  }
}
