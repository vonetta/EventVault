import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

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

function r2Client() {
  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

export async function storeFile(file: File, folder: string): Promise<StoredObject> {
  const ext = path.extname(file.name) || "";
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

  const uploadsDir = path.join(process.cwd(), "uploads");
  const fullPath = path.join(uploadsDir, storageKey);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, bytes);
  return { storageKey, storageProvider: "local" };
}

export async function getDownloadUrl(storageKey: string, storageProvider: "r2" | "local") {
  if (storageProvider === "local") {
    return `/api/media/local?key=${encodeURIComponent(storageKey)}`;
  }

  if (process.env.R2_PUBLIC_BASE_URL) {
    return `${process.env.R2_PUBLIC_BASE_URL.replace(/\/$/, "")}/${storageKey}`;
  }

  return getSignedUrl(
    r2Client(),
    new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: storageKey,
    }),
    { expiresIn: 60 * 60 },
  );
}
