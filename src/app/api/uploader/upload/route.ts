import { NextResponse } from "next/server";
import { isAdminAuthenticated, isUploaderAuthenticated, unauthorized } from "@/lib/auth";
import { processMediaUpload } from "@/lib/media-upload";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * Team uploads always land in the admin "Main gallery" as staged `team_photo`.
 * The admin later sends them to specific groups (or everyone); guests never see
 * them until then.
 */
const UPLOADER_KINDS = ["team_photo"] as const;

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
