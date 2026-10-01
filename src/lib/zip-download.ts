import { ZipArchive } from "archiver";
import { PassThrough, Readable } from "node:stream";
import { openStoredObjectStream } from "@/lib/storage";

export const TEAM_ZIP_MAX_FILES = 1000;
export const TEAM_ZIP_MAX_BYTES = 500 * 1024 * 1024;

export function safeZipName(input: string, fallback: string) {
  const cleaned = input
    .replace(/[^\w.\- ()]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return cleaned || fallback;
}

function pathHasExt(name: string) {
  const i = name.lastIndexOf(".");
  return i > 0 && i < name.length - 1;
}

export function uniqueZipPath(used: Set<string>, folder: string, filename: string) {
  let base = safeZipName(filename, "photo.jpg");
  if (!pathHasExt(base)) base = `${base}.jpg`;
  let candidate = folder ? `${folder}/${base}` : base;
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    const ext = base.includes(".") ? base.slice(base.lastIndexOf(".")) : "";
    const stem = ext ? base.slice(0, -ext.length) : base;
    const next = `${stem}-${n}${ext}`;
    candidate = folder ? `${folder}/${next}` : next;
    n += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

export type ZipStreamEntry = {
  path: string;
  storageKey: string;
  storageProvider: "r2" | "local";
  size?: number | null;
};

/**
 * Stream a ZIP response while pulling objects from R2/local storage.
 * Caps file count and total bytes so huge piles stay bounded.
 */
export function createZipDownloadResponse(
  entries: ZipStreamEntry[],
  filename: string,
  limits: { maxFiles: number; maxBytes: number } = {
    maxFiles: TEAM_ZIP_MAX_FILES,
    maxBytes: TEAM_ZIP_MAX_BYTES,
  },
): Response {
  const pass = new PassThrough();
  const archive = new ZipArchive({ zlib: { level: 6 } });
  archive.pipe(pass);

  const capped = entries.slice(0, limits.maxFiles);

  void (async () => {
    try {
      let totalBytes = 0;
      let added = 0;

      for (const entry of capped) {
        if (totalBytes >= limits.maxBytes) break;

        try {
          const { stream, contentLength } = await openStoredObjectStream(
            entry.storageKey,
            entry.storageProvider,
          );
          const estimatedSize = contentLength ?? entry.size ?? 0;
          totalBytes += estimatedSize;
          if (totalBytes > limits.maxBytes) {
            stream.destroy();
            break;
          }
          archive.append(stream, { name: entry.path });
          added += 1;
        } catch {
          // Skip missing / unreadable files
        }
      }

      if (added === 0) {
        archive.abort();
        pass.destroy(new Error("No photos could be packed"));
        return;
      }

      await archive.finalize();
    } catch (error) {
      archive.abort();
      pass.destroy(error instanceof Error ? error : undefined);
    }
  })();

  const safeFilename = safeZipName(filename, "photos.zip").replace(/\s+/g, "-");

  return new Response(Readable.toWeb(pass) as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safeFilename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
