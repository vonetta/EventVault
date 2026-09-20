import { Guest, Group, type GroupDoc } from "@/lib/models";
import { createTicketCode } from "@/lib/tickets";

async function uniqueGroupLoginCode() {
  let loginCode = createTicketCode("GP");
  for (let i = 0; i < 8; i++) {
    const taken =
      (await Group.findOne({ loginCode }).select("_id")) ||
      (await Guest.findOne({ ticketCode: loginCode }).select("_id"));
    if (!taken) return loginCode;
    loginCode = createTicketCode("GP");
  }
  return loginCode;
}

/**
 * Ensure a group has a shared login code and a companion guest account.
 * Everyone uses the same code → same guest session → sees that group's photos.
 */
export async function ensureGroupSharedLogin(group: GroupDoc) {
  let loginCode = group.loginCode || "";
  let shared = await Guest.findOne({ sharedGroupId: group._id });

  if (!loginCode) {
    loginCode = shared?.ticketCode || (await uniqueGroupLoginCode());
    group.loginCode = loginCode;
    await group.save();
  }

  if (!shared) {
    shared = await Guest.create({
      eventId: group.eventId,
      name: `${group.name} (group login)`,
      email: "",
      tier: "standard",
      ticketCode: loginCode,
      groupIds: [group._id],
      sharedGroupId: group._id,
    });
  } else {
    let dirty = false;
    if (shared.ticketCode !== loginCode) {
      shared.ticketCode = loginCode;
      dirty = true;
    }
    const hasGroup = (shared.groupIds || []).some((id) => String(id) === String(group._id));
    if (!hasGroup) {
      shared.groupIds = [...(shared.groupIds || []), group._id];
      dirty = true;
    }
    const expectedName = `${group.name} (group login)`;
    if (shared.name !== expectedName) {
      shared.name = expectedName;
      dirty = true;
    }
    if (dirty) await shared.save();
  }

  return { loginCode, guestId: String(shared._id) };
}

export async function regenerateGroupLoginCode(group: GroupDoc) {
  const loginCode = await uniqueGroupLoginCode();
  group.loginCode = loginCode;
  await group.save();

  const shared = await Guest.findOne({ sharedGroupId: group._id });
  if (shared) {
    shared.ticketCode = loginCode;
    shared.sessionVersion = (shared.sessionVersion ?? 0) + 1;
    await shared.save();
  } else {
    await ensureGroupSharedLogin(group);
  }

  return loginCode;
}

export async function deleteGroupSharedLogin(groupId: string) {
  await Guest.deleteMany({ sharedGroupId: groupId });
}
