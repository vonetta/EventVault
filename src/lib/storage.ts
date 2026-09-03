import { createReadStream } from "fs";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import type { Readable } from "stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export type StoredObject = {
  storageKey: string;
  storageProvider: "r2" | "local";
};

function r2Configured() {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME,
  );
}

let _r2Client: S3Client | null = null;

function r2Client() {
  if (_r2Client) return _r2Client;
  _r2Client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
  return _r2Client;
}

export function uploadsRoot() {
  return path.resolve(process.cwd(), "uploads");
}

/** Resolve a storage key under uploads/; reject path traversal. */
export function resolveLocalPath(storageKey: string) {
  const root = uploadsRoot();
  const full = path.resolve(root, storageKey);
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error("Invalid storage key");
  }
  return full;
}

export async function storeFile(file: File, folder: string): Promise<StoredObject> {
  const ext = path.extname(file.name).toLowerCase() || "";
  const storageKey = `${folder}/${randomUUID()}${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  if (r2Configured()) {
    await r2Client().send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME!,
        Key: storageKey,
        Body: bytes,
        ContentType: file.type || "application/octet-stream",
      }),
    );
    return { storageKey, storageProvider: "r2" };
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("R2 must be configured for media storage in production");
  }

  const fullPath = resolveLocalPath(storageKey);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, bytes);
  return { storageKey, storageProvider: "local" };
}

export async function readStoredObject(
  storageKey: string,
  storageProvider: "r2" | "local",
): Promise<{ body: Buffer | Uint8Array; contentType?: string }> {
  if (storageProvider === "local") {
    const fullPath = resolveLocalPath(storageKey);
    const body = await readFile(fullPath);
    return { body };
  }

  const result = await r2Client().send(
    new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: storageKey,
    }),
  );
  const bytes = await result.Body?.transformToByteArray();
  if (!bytes) throw new Error("Empty object");
  return { body: bytes, contentType: result.ContentType };
}

export async function openStoredObjectStream(
  storageKey: string,
  storageProvider: "r2" | "local",
): Promise<{ stream: Readable; contentType?: string; contentLength?: number }> {
  if (storageProvider === "local") {
    const fullPath = resolveLocalPath(storageKey);
    return { stream: createReadStream(fullPath) };
  }

  const result = await r2Client().send(
    new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: storageKey,
    }),
  );

  const body = result.Body;
  if (!body || typeof body.transformToWebStream !== "function") {
    throw new Error("Empty object");
  }

  const { Readable: NodeReadable } = await import("stream");
  return {
    stream: NodeReadable.fromWeb(body.transformToWebStream() as import("stream/web").ReadableStream),
    contentType: result.ContentType,
    contentLength: result.ContentLength,
  };
}

export async function deleteStoredObject(
  storageKey: string,
  storageProvider: "r2" | "local",
) {
  if (!storageKey) return;

  if (storageProvider === "local") {
    try {
      await unlink(resolveLocalPath(storageKey));
    } catch {
      // File may already be gone
    }
    return;
  }

  if (!r2Configured()) return;

  await r2Client().send(
    new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: storageKey,
    }),
  );
}

/** Browser-facing media URL — always goes through authz proxy. */
export function mediaProxyUrl(mediaId: string) {
  return `/api/media/${mediaId}`;
}
