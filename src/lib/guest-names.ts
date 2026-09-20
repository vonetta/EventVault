import { Guest } from "@/lib/models";
import { createTicketCode } from "@/lib/tickets";
import { foldGuestName, normalizeGuestName } from "@/lib/guest-name-match";

export {
  normalizeGuestName,
  foldGuestName,
  suggestSimilarGuests,
  type NameOnlyGuest,
} from "@/lib/guest-name-match";

/** Case-insensitive exact match within an event. */
export async function findGuestByExactName(eventId: string, name: string) {
  const folded = foldGuestName(name);
  if (!folded) return null;
  const guests = await Guest.find({ eventId }).select("_id name").lean();
  return guests.find((guest) => foldGuestName(guest.name) === folded) || null;
}

export async function uniqueTicketCode() {
  let ticketCode = createTicketCode();
  for (let i = 0; i < 8; i++) {
    const exists = await Guest.findOne({ ticketCode });
    if (!exists) return ticketCode;
    ticketCode = createTicketCode();
  }
  return ticketCode;
}

/**
 * Create a guest from a name only (no email). Used when tagging people who
 * are not on the import list yet. Ticket code is generated so the admin can
 * email access later once contact info is known.
 */
export async function createGuestByName(eventId: string, rawName: string) {
  const name = normalizeGuestName(rawName);
  if (!name) {
    return { error: "Name is required" as const };
  }

  const existing = await findGuestByExactName(eventId, name);
  if (existing) {
    return {
      guest: { _id: String(existing._id), name: existing.name },
      created: false as const,
    };
  }

  const guest = await Guest.create({
    eventId,
    name,
    email: "",
    tier: "standard",
    ticketCode: await uniqueTicketCode(),
    groupIds: [],
  });

  return {
    guest: { _id: String(guest._id), name: guest.name },
    created: true as const,
  };
}
