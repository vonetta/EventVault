import { connectDB } from "@/lib/db";
import { AuditLog } from "@/lib/models";
import { clientIp } from "@/lib/rate-limit";

export type ActivityActor = "guest" | "admin" | "uploader" | "system";

export type LogActivityInput = {
  action: string;
  actor?: ActivityActor;
  actorName?: string;
  guestId?: string;
  eventId?: string;
  details?: Record<string, unknown>;
};

/**
 * Record who did what. Never throws — logging must not break the product flow.
 */
export async function logActivity(request: Request, input: LogActivityInput) {
  try {
    await connectDB();
    await AuditLog.create({
      action: input.action,
      actor: input.actor || "admin",
      actorName: input.actorName || "",
      guestId: input.guestId || null,
      eventId: input.eventId || null,
      details: input.details || {},
      ip: clientIp(request),
    });
  } catch {
    // Audit must not block workflows
  }
}

/** Admin / team actions (back-compat wrapper). */
export async function logAdminAction(
  request: Request,
  action: string,
  details?: Record<string, unknown>,
) {
  const actor =
    details && typeof details.actor === "string" && details.actor === "uploader"
      ? "uploader"
      : "admin";
  const actorName =
    typeof details?.uploadedByName === "string" && details.uploadedByName
      ? String(details.uploadedByName)
      : actor === "uploader"
        ? "Photo team"
        : "Admin";

  await logActivity(request, {
    action,
    actor,
    actorName,
    eventId: typeof details?.eventId === "string" ? details.eventId : undefined,
    details,
  });
}
