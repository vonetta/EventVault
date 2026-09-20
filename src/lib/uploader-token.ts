export const UPLOADER_COOKIE = "ev_uploader";

/** Short stamp of UPLOADER_PASSWORD so changing it invalidates old sessions. */
export async function uploaderPasswordStamp() {
  const password = process.env.UPLOADER_PASSWORD?.trim() || "";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

export async function isUploaderJwtPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return false;
  const value = payload as { role?: unknown; pv?: unknown };
  return value.role === "uploader" && value.pv === (await uploaderPasswordStamp());
}
