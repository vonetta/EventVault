import { connectDB } from "@/lib/db";
import { AuditLog } from "@/lib/models";
import { clientIp } from "@/lib/rate-limit";

export async function logAdminAction(
  request: Request,
  action: string,
  details?: Record<string, unknown>,
) {
  try {
    await connectDB();
    await AuditLog.create({
      action,
      details: details || {},
      ip: clientIp(request),
    });
  } catch {
    // Audit must not block admin workflows
  }
}
