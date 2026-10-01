import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import {
  assertSameOrigin,
  isAdminAuthenticated,
  isUploaderAuthenticated,
  unauthorized,
} from "@/lib/auth";
import { Media } from "@/lib/models";
import { logActivity } from "@/lib/audit";
import { objectIdSchema } from "@/lib/validate";
import {
  CLEANUP_ENGINE,
  cleanupPreviewStorageKey,
  enhanceLightingAndSharpness,
} from "@/lib/cleanup-preview";
import { deleteStoredObject, mediaProxyUrl, readStoredObject, storeBytes } from "@/lib/storage";
import { z } from "zod";

const bodySchema = z.object({
  mediaId: objectIdSchema,
  action: z.enum(["generate", "apply", "discard"]),
});

/**
 * Sandbox cleanup for Needs editing photos.
 * generate → write a separate preview (original untouched)
 * apply    → replace the original with the preview (still Needs editing)
 * discard  → delete the preview only
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const isAdmin = await isAdminAuthenticated();
  const isUploader = await isUploaderAuthenticated();
  if (!isAdmin && !isUploader) return unauthorized();

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  await connectDB();
  const media = await Media.findById(body.mediaId);
  if (!media) {
    return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  }

  // Uploaders only work staged team photos; admins can touch the edit pile kinds.
  if (
    isUploader &&
    !isAdmin &&
    !(media.kind === "team_photo" && media.published === false)
  ) {
    return NextResponse.json({ error: "Not allowed for this photo" }, { status: 403 });
  }

  if (media.storageProvider === "youtube" || !media.storageKey) {
    return NextResponse.json({ error: "This photo has no file to clean up" }, { status: 400 });
  }
  if (media.storageProvider !== "r2" && media.storageProvider !== "local") {
    return NextResponse.json({ error: "Unsupported storage" }, { status: 400 });
  }

  if (body.action === "discard") {
    await discardPreview(media);
    await logActivity(request, {
      action: "cleanup_preview_discard",
      actor: isAdmin ? "admin" : "uploader",
      eventId: String(media.eventId),
      details: { summary: `Discarded cleanup preview · ${media.filename || media._id}` },
    });
    return NextResponse.json({
      ok: true,
      mediaId: String(media._id),
      hasCleanupPreview: false,
      cleanupPreviewUrl: null,
    });
  }

  if (body.action === "apply") {
    if (!media.cleanupPreviewKey || !media.cleanupPreviewProvider) {
      return NextResponse.json(
        { error: "Run cleanup first — there’s no preview to apply." },
        { status: 400 },
      );
    }
    if (
      media.cleanupPreviewProvider !== "r2" &&
      media.cleanupPreviewProvider !== "local"
    ) {
      return NextResponse.json({ error: "Invalid preview storage" }, { status: 400 });
    }

    const { body: previewBytes } = await readStoredObject(
      media.cleanupPreviewKey,
      media.cleanupPreviewProvider,
    );
    const folder = `events/${String(media.eventId)}/cleanup-applied`;
    const stored = await storeBytes(
      Buffer.from(previewBytes),
      folder,
      media.filename || "photo.jpg",
      "image/jpeg",
    );

    const oldKey = media.storageKey;
    const oldProvider = media.storageProvider;
    const previewKey = media.cleanupPreviewKey;
    const previewProvider = media.cleanupPreviewProvider as "r2" | "local";
    await Media.updateOne(
      { _id: media._id },
      {
        $set: {
          storageKey: stored.storageKey,
          storageProvider: stored.storageProvider,
          contentType: "image/jpeg",
          size: Buffer.from(previewBytes).byteLength,
          cleanupPreviewKey: "",
          cleanupPreviewProvider: "",
          cleanupPreviewEngine: "",
          cleanupPreviewAt: null,
        },
      },
    );

    // Best-effort cleanup of old blobs (don’t fail the request).
    try {
      if (oldKey && oldKey !== stored.storageKey) {
        await deleteStoredObject(oldKey, oldProvider as "r2" | "local");
      }
      if (previewKey) await deleteStoredObject(previewKey, previewProvider);
    } catch {
      // ignore
    }

    await logActivity(request, {
      action: "cleanup_preview_apply",
      actor: isAdmin ? "admin" : "uploader",
      eventId: String(media.eventId),
      details: {
        summary: `Applied cleanup preview · ${media.filename || media._id}`,
        meta: { engine: CLEANUP_ENGINE },
      },
    });

    return NextResponse.json({
      ok: true,
      mediaId: String(media._id),
      hasCleanupPreview: false,
      cleanupPreviewUrl: null,
      url: mediaProxyUrl(String(media._id)),
      applied: true,
    });
  }

  // generate
  const { body: original } = await readStoredObject(
    media.storageKey,
    media.storageProvider,
  );
  const enhanced = await enhanceLightingAndSharpness(Buffer.from(original));
  const key = cleanupPreviewStorageKey(String(media.eventId), String(media._id));
  const stored = await storeBytes(
    enhanced.buffer,
    `events/${String(media.eventId)}/cleanup-preview`,
    `${String(media._id)}.jpg`,
    "image/jpeg",
    key,
  );

  // Replace any previous preview blob if the key changed.
  if (
    media.cleanupPreviewKey &&
    media.cleanupPreviewKey !== stored.storageKey &&
    (media.cleanupPreviewProvider === "r2" || media.cleanupPreviewProvider === "local")
  ) {
    try {
      await deleteStoredObject(
        media.cleanupPreviewKey,
        media.cleanupPreviewProvider as "r2" | "local",
      );
    } catch {
      // ignore
    }
  }

  // Use updateOne so new schema fields persist even if a hot-reloaded
  // Mongoose model was compiled before cleanupPreview* existed.
  await Media.updateOne(
    { _id: media._id },
    {
      $set: {
        cleanupPreviewKey: stored.storageKey,
        cleanupPreviewProvider: stored.storageProvider,
        cleanupPreviewEngine: CLEANUP_ENGINE,
        cleanupPreviewAt: new Date(),
      },
    },
  );

  await logActivity(request, {
    action: "cleanup_preview_generate",
    actor: isAdmin ? "admin" : "uploader",
    eventId: String(media.eventId),
    details: {
      summary: `Generated cleanup preview · ${media.filename || media._id}`,
      meta: {
        engine: CLEANUP_ENGINE,
        before: enhanced.before,
        after: enhanced.after,
      },
    },
  });

  const stamp = Date.now();
  return NextResponse.json({
    ok: true,
    mediaId: String(media._id),
    hasCleanupPreview: true,
    cleanupPreviewUrl: `${mediaProxyUrl(String(media._id))}?variant=cleanup&t=${stamp}`,
    engine: CLEANUP_ENGINE,
    before: enhanced.before,
    after: enhanced.after,
    // cache-bust the original URL after regenerate
    url: `${mediaProxyUrl(String(media._id))}?t=${stamp}`,
  });
}

async function discardPreview(media: {
  _id: mongoose.Types.ObjectId;
  cleanupPreviewKey?: string | null;
  cleanupPreviewProvider?: string | null;
}) {
  if (
    media.cleanupPreviewKey &&
    (media.cleanupPreviewProvider === "r2" || media.cleanupPreviewProvider === "local")
  ) {
    try {
      await deleteStoredObject(
        media.cleanupPreviewKey,
        media.cleanupPreviewProvider as "r2" | "local",
      );
    } catch {
      // ignore missing
    }
  }
  await Media.updateOne(
    { _id: media._id },
    {
      $set: {
        cleanupPreviewKey: "",
        cleanupPreviewProvider: "",
        cleanupPreviewEngine: "",
        cleanupPreviewAt: null,
      },
    },
  );
}

export const maxDuration = 60;
