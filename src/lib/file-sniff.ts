/** Magic-byte sniffing — do not trust client Content-Type alone. */
export function sniffImageMime(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }

  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return "image/gif";
  }

  if (
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
}

export function sniffVideoMime(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;

  const box = buffer.toString("ascii", 4, 8);
  if (box === "ftyp") {
    const brand = buffer.toString("ascii", 8, 12);
    if (brand.startsWith("qt")) return "video/quicktime";
    return "video/mp4";
  }

  if (
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  ) {
    return "video/webm";
  }

  return null;
}

export function assertFileMatchesMime(buffer: Buffer, declaredMime: string) {
  const mime = declaredMime.toLowerCase();
  if (mime.startsWith("image/")) {
    const sniffed = sniffImageMime(buffer);
    if (!sniffed || sniffed !== mime) {
      throw new Error("File content does not match declared image type");
    }
    return sniffed;
  }

  if (mime.startsWith("video/")) {
    const sniffed = sniffVideoMime(buffer);
    if (!sniffed) {
      throw new Error("File content does not match declared video type");
    }
    if (sniffed !== mime && !(mime === "video/mp4" && sniffed === "video/quicktime")) {
      throw new Error("File content does not match declared video type");
    }
    return sniffed;
  }

  throw new Error("Unsupported file type");
}
