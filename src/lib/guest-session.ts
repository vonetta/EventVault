import { connectDB } from "@/lib/db";
import { clearGuestSession, getGuestSession, type GuestSession } from "@/lib/auth";
import { Guest, type GuestDoc } from "@/lib/models";

export type ResolvedGuestSession = {
  session: GuestSession;
  guest: GuestDoc;
};

/** Load guest from DB and verify session version (invalidates regen'd tickets). */
export async function resolveGuestSession(): Promise<ResolvedGuestSession | null> {
  const session = await getGuestSession();
  if (!session) return null;

  await connectDB();
  const guest = await Guest.findById(session.guestId);
  if (!guest) {
    await clearGuestSession();
    return null;
  }

  const currentVersion = guest.sessionVersion ?? 0;
  const tokenVersion = session.sv ?? 0;
  if (tokenVersion !== currentVersion) {
    await clearGuestSession();
    return null;
  }

  return { session, guest };
}

export function guestSessionPayload(guest: GuestDoc) {
  return {
    guestId: String(guest._id),
    eventId: String(guest.eventId),
    tier: guest.tier as "vip" | "standard",
    name: guest.name,
    sv: guest.sessionVersion ?? 0,
  };
}
