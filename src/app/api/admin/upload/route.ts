import { isAdminAuthenticated, unauthorized } from "@/lib/auth";
import { ALL_MEDIA_KINDS, processMediaUpload } from "@/lib/media-upload";

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) return unauthorized();
  return processMediaUpload(request, { allowedKinds: ALL_MEDIA_KINDS, actor: "admin" });
}
