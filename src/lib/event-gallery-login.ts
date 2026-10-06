import { Event, Guest, type EventDoc } from "@/lib/models";
import { createTicketCode } from "@/lib/tickets";

async function uniqueGalleryLoginCode() {
  let loginCode = createTicketCode("WE");
  for (let i = 0; i < 8; i++) {
    const taken =
      (await Event.findOne({ galleryLoginCode: loginCode }).select("_id")) ||
      (await Guest.findOne({ ticketCode: loginCode }).select("_id"));
    if (!taken) return loginCode;
    loginCode = createTicketCode("WE");
  }
  return loginCode;
}

/**
 * One shared code for the whole event: anyone who enters it sees the free
 * Whole-event album (same as any standard guest). Photos of you stay locked
 * unless that person has their own VIP/personal ticket.
 */
export async function ensureEventGalleryLogin(event: EventDoc) {
  let loginCode = event.galleryLoginCode || "";
  let shared = await Guest.findOne({ sharedEventGalleryId: event._id });

  if (!loginCode) {
    loginCode = shared?.ticketCode || (await uniqueGalleryLoginCode());
    await Event.updateOne({ _id: event._id }, { $set: { galleryLoginCode: loginCode } });
    event.galleryLoginCode = loginCode;
  }

  if (!shared) {
    shared = await Guest.create({
      eventId: event._id,
      name: "Whole event (shared gallery)",
      email: "",
      tier: "standard",
      ticketCode: loginCode,
      groupIds: [],
      sharedEventGalleryId: event._id,
    });
  } else {
    let dirty = false;
    if (shared.ticketCode !== loginCode) {
      shared.ticketCode = loginCode;
      dirty = true;
    }
    if (shared.name !== "Whole event (shared gallery)") {
      shared.name = "Whole event (shared gallery)";
      dirty = true;
    }
    if (dirty) await shared.save();
  }

  return { loginCode, guestId: String(shared._id) };
}

export async function regenerateEventGalleryLogin(event: EventDoc) {
  const loginCode = await uniqueGalleryLoginCode();
  await Event.updateOne({ _id: event._id }, { $set: { galleryLoginCode: loginCode } });
  event.galleryLoginCode = loginCode;

  const shared = await Guest.findOne({ sharedEventGalleryId: event._id });
  if (shared) {
    shared.ticketCode = loginCode;
    shared.sessionVersion = (shared.sessionVersion ?? 0) + 1;
    await shared.save();
  } else {
    await ensureEventGalleryLogin(event);
  }

  return loginCode;
}

export async function deleteEventGalleryLogin(eventId: string) {
  await Guest.deleteMany({ sharedEventGalleryId: eventId });
}
