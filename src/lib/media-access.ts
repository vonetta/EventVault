import { isAdminAuthenticated, isUploaderAuthenticated } from "@/lib/auth";
import { type MediaDoc } from "@/lib/models";
import { resolveGuestSession } from "@/lib/guest-session";
import { isMediaAvailable } from "@/lib/youtube";

/** A published team photo is visible when sent to everyone or a guest's group. */
export function guestCanSeeTeamPhoto(
  media: Pick<MediaDoc, "published" | "everyone" | "groupIds">,
  guestGroupIds: string[],
): boolean {
  if (!media.published) return false;
  if (media.everyone) return true;
  const groups = (media.groupIds || []).map((id) => String(id));
  return groups.some((id) => guestGroupIds.includes(id));
}

export async function canAccessMedia(media: MediaDoc): Promise<boolean> {
  const resolved = await resolveGuestSession();
  if (resolved) {
    const { guest } = resolved;
    if (String(guest.eventId) !== String(media.eventId)) return false;
    if (!isMediaAvailable(media.availableUntil)) return false;
    if (media.kind === "group_photo" || media.kind === "event_photo") return true;
    if (media.kind === "team_photo") {
      const guestGroupIds = (guest.groupIds || []).map((id) => String(id));
      return guestCanSeeTeamPhoto(media, guestGroupIds);
    }
    if (guest.tier !== "vip") return false;
    if (media.kind === "session_video") return true;
    if (media.kind === "personal_photo") {
      return String(media.guestId) === String(guest._id);
    }
    return false;
  }

  if (await isAdminAuthenticated()) return true;
  // Photo team can preview their own staged/curated uploads (team photos only).
  if (await isUploaderAuthenticated()) return media.kind === "team_photo";
  return false;
}
