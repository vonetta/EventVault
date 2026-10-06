import { isAdminAuthenticated, isUploaderAuthenticated } from "@/lib/auth";
import { isPersonalizedForGuest } from "@/lib/individual-photos";
import { Guest, type MediaDoc } from "@/lib/models";
import { isEditTagName } from "@/lib/needs-editing";
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

/** Needs editing flag or Edit person-tag — keep out of the guest vault. */
async function mediaHeldForEditing(
  media: Pick<MediaDoc, "needsEditing" | "taggedGuestIds" | "eventId">,
): Promise<boolean> {
  if (media.needsEditing) return true;
  const tags = media.taggedGuestIds || [];
  if (!tags.length) return false;
  const taggedGuests = await Guest.find({
    _id: { $in: tags },
    eventId: media.eventId,
  })
    .select("name")
    .lean();
  return taggedGuests.some((guest) => isEditTagName(guest.name || ""));
}

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
    // Needs-editing / Edit-tagged photos stay out of the guest vault entirely.
    if (await mediaHeldForEditing(media)) return "none";

    const guestId = String(guest._id);

    // Personalized Photos of you (solo/couple tags or assigned VIP) use the
    // watermark paywall. Crowd / multi-tag group shots stay free in Whole event.
    if (isPersonalizedForGuest(media, guestId)) {
      if (session.adminPreview) return "full";
      if (guest.tier === "vip" || guest.personalPhotosPaid) return "full";
      return "preview";
    }

    if (media.kind === "group_photo" || media.kind === "event_photo") return "full";

    if (media.kind === "team_photo") {
      const guestGroupIds = (guest.groupIds || []).map((id) => String(id));
      return guestCanSeeTeamPhoto(media, guestGroupIds) ? "full" : "none";
    }

    // Speaker sessions are behind the same one-time unlock as individual photos.
    if (media.kind === "session_video") {
      if (session.adminPreview) return "full";
      if (guest.tier === "vip" || guest.personalPhotosPaid) return "full";
      return "none";
    }

    return "none";
  }

  if (await isAdminAuthenticated()) return "full";
  if (await isUploaderAuthenticated()) {
    // Uploaders only need staged (not-yet-sent) team photos for tagging / edits.
    // Published guest-facing photos stay admin-managed.
    if (media.kind === "team_photo" && !media.published) return "full";
    return "none";
  }
  return "none";
}

export async function canAccessMedia(media: MediaDoc): Promise<boolean> {
  return (await getMediaAccessLevel(media)) !== "none";
}
