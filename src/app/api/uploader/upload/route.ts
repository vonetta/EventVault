import { NextResponse } from "next/server";
import { isAdminAuthenticated, isUploaderAuthenticated, unauthorized } from "@/lib/auth";
import { processMediaUpload } from "@/lib/media-upload";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/** Team uploaders may only add to the shared galleries (not VIP/session media). */
const UPLOADER_KINDS = ["event_photo", "group_photo"] as const;

export async function POST(request: Request) {
  if (!(await isUploaderAuthenticated()) && !(await isAdminAuthenticated())) {
    return unauthorized();
  }

  const limited = await rateLimit(`uploader-upload:${clientIp(request)}`, 120, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many uploads. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } },
    );
  }

  return processMediaUpload(request, { allowedKinds: UPLOADER_KINDS, actor: "uploader" });
}
