import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/auth";
import { Guest, Media, type MediaDoc } from "@/lib/models";
import { resolveGuestSession } from "@/lib/guest-session";
import { isMediaAvailable } from "@/lib/youtube";

export async function canAccessMedia(media: MediaDoc): Promise<boolean> {
  if (await isAdminAuthenticated()) return true;

  const resolved = await resolveGuestSession();
  if (!resolved) return false;

  const { guest } = resolved;

  if (String(guest.eventId) !== String(media.eventId)) return false;

  if (!isMediaAvailable(media.availableUntil)) return false;

  if (media.kind === "group_photo") return true;

  if (guest.tier !== "vip") return false;

  if (media.kind === "session_video") return true;

  if (media.kind === "personal_photo") {
    return String(media.guestId) === String(guest._id);
  }

  return false;
}
