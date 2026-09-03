export const ADMIN_COOKIE = "ev_admin";

export async function adminPasswordStamp() {
  const password = process.env.ADMIN_PASSWORD?.trim() || "";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

export async function isAdminJwtPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return false;
  const value = payload as { role?: unknown; pv?: unknown };
  return value.role === "admin" && value.pv === (await adminPasswordStamp());
}
