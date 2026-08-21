import { connectDB } from "@/lib/db";
import {
  getGuestSession,
  isAdminAuthenticated,
  clearGuestSession,
} from "@/lib/auth";
import { Guest, Media, type MediaDoc } from "@/lib/models";

export async function canAccessMedia(media: MediaDoc): Promise<boolean> {
  if (await isAdminAuthenticated()) return true;

  const session = await getGuestSession();
  if (!session) return false;

  await connectDB();
  const guest = await Guest.findById(session.guestId);
  if (!guest) {
    await clearGuestSession();
    return false;
  }

  if (String(guest.eventId) !== String(media.eventId)) return false;

  if (media.kind === "group_photo") return true;

  if (guest.tier !== "vip") return false;

  if (media.kind === "session_video") return true;

  if (media.kind === "personal_photo") {
    return String(media.guestId) === String(guest._id);
  }

  return false;
}
