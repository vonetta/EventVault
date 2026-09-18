import { isAdminAuthenticated, isUploaderAuthenticated } from "@/lib/auth";
import { type MediaDoc } from "@/lib/models";
import { resolveGuestSession } from "@/lib/guest-session";
import { isMediaAvailable } from "@/lib/youtube";

/** A published team photo is visible when sent to everyone or a guest's group. */
export function guestCanSeeTeamPhoto(
  media: Pick<MediaDoc, "published" | "everyone" | "groupIds">,
  guestGroupIds: string[],
): boolean {
  return (
    Boolean(media.published) &&
    (Boolean(media.everyone) ||
      (media.groupIds || []).map((id) => String(id)).some((id) => guestGroupIds.includes(id)))
  );
}

export type MediaAccessLevel = "full" | "preview" | "none";

/**
 * How much of a media item the current requester may see:
 *   full    -> original bytes (view + download)
 *   preview -> watermarked low-res only (locked individual photo, not yet paid)
 *   none    -> not authorized
 */
export async function getMediaAccessLevel(media: MediaDoc): Promise<MediaAccessLevel> {
  const resolved = await resolveGuestSession();
  if (resolved) {
    const { session, guest } = resolved;
    if (String(guest.eventId) !== String(media.eventId)) return "none";
    if (!isMediaAvailable(media.availableUntil)) return "none";

    if (media.kind === "group_photo" || media.kind === "event_photo") return "full";

    if (media.kind === "team_photo") {
      const guestGroupIds = (guest.groupIds || []).map((id) => String(id));
      return guestCanSeeTeamPhoto(media, guestGroupIds) ? "full" : "none";
    }

    // Individual photos: available to the assigned guest (any tier), but locked
    // behind payment. Admin preview sees them unlocked.
    if (media.kind === "personal_photo") {
      if (String(media.guestId) !== String(guest._id)) return "none";
      if (session.adminPreview) return "full";
      return guest.personalPhotosPaid ? "full" : "preview";
    }

    // Speaker sessions are behind the same one-time unlock as individual photos.
    if (media.kind === "session_video") {
      if (session.adminPreview) return "full";
      return guest.personalPhotosPaid ? "full" : "none";
    }

    return "none";
  }

  if (await isAdminAuthenticated()) return "full";
  if (await isUploaderAuthenticated()) {
    return media.kind === "team_photo" ? "full" : "none";
  }
  return "none";
}

export async function canAccessMedia(media: MediaDoc): Promise<boolean> {
  return (await getMediaAccessLevel(media)) !== "none";
}
