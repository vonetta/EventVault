"use client";

import { FormEvent, useMemo, useState } from "react";
import { AdminButton, AdminField, AdminPanel, inputClassName } from "@/components/admin/ui";
import type { AdminActions, AdminData, GuestDoc } from "@/components/admin/types";
import { vaultLoginUrl } from "@/lib/vault-url";

export function GroupsTab({
  data,
  actions,
}: {
  data: AdminData;
  actions: AdminActions;
}) {
  const [newGroupName, setNewGroupName] = useState("");
  const [creating, setCreating] = useState(false);
  const [regenId, setRegenId] = useState<string | null>(null);

  const groups = data.groups || [];
  const peopleGuests = useMemo(
    () => data.guests.filter((guest) => !guest.isSharedLogin),
    [data.guests],
  );

  function memberCount(groupId: string) {
    return peopleGuests.filter((guest) => (guest.groupIds || []).includes(groupId)).length;
  }

  function emailBlurb(groupName: string, loginCode: string) {
    const link = vaultLoginUrl(loginCode);
    return [
      `You're invited to the ${data.event?.name || "event"} photo vault.`,
      "",
      `Group: ${groupName}`,
      `Login code: ${loginCode}`,
      "",
      `Open: ${link}`,
      "",
      "Enter the code on the site (or use the link) to see your group's photos.",
    ].join("\n");
  }

  async function addGroup(event: FormEvent) {
    event.preventDefault();
    if (!data.event || !newGroupName.trim()) return;
    setCreating(true);
    const json = await actions.postAction({
      action: "create_group",
      eventId: data.event._id,
      name: newGroupName.trim(),
    });
    setCreating(false);
    if (!json) return;
    const loginCode = (json as { group?: { loginCode?: string } }).group?.loginCode;
    setNewGroupName("");
    actions.setMessage(
      loginCode
        ? `Group created. Shared login code: ${loginCode}`
        : "Group created.",
    );
    await actions.load(data.event._id);
  }

  async function renameGroup(groupId: string, name: string, previous: string) {
    const trimmed = name.trim();
    if (!trimmed || trimmed === previous) return;
    const json = await actions.postAction({ action: "rename_group", groupId, name: trimmed });
    if (!json) return;
    await actions.load(data.event?._id);
  }

  async function deleteGroup(groupId: string, name: string) {
    if (
      !confirm(
        `Delete the group "${name}"? Guests will be removed from it, the shared login code will stop working, and any photos sent only to this group will return to the Main gallery.`,
      )
    ) {
      return;
    }
    const json = await actions.postAction({ action: "delete_group", groupId });
    if (!json) return;
    actions.setMessage("Group deleted.");
    await actions.load(data.event?._id);
  }

  async function regenerateCode(groupId: string, name: string) {
    if (
      !confirm(
        `Generate a new login code for "${name}"? The old code will stop working for anyone who already has it.`,
      )
    ) {
      return;
    }
    setRegenId(groupId);
    const json = await actions.postAction({ action: "regenerate_group_code", groupId });
    setRegenId(null);
    if (!json) return;
    const loginCode = (json as { group?: { loginCode?: string } }).group?.loginCode;
    actions.setMessage(loginCode ? `New group code: ${loginCode}` : "Group code updated.");
    await actions.load(data.event?._id);
  }

  async function toggleGuestGroup(guest: GuestDoc, groupId: string, checked: boolean) {
    const current = new Set(guest.groupIds || []);
    if (checked) current.add(groupId);
    else current.delete(groupId);
    const json = await actions.postAction({
      action: "set_guest_groups",
      guestId: guest._id,
      groupIds: [...current],
    });
    if (!json) return;
    await actions.load(data.event?._id);
  }

  return (
    <>
      <AdminPanel
        title="Groups"
        description="Create groups (e.g. small groups or families). Each group gets one shared login code you can paste into a single email."
      >
        <form onSubmit={addGroup} className="flex flex-wrap items-end gap-3">
          <AdminField label="New group name" className="min-w-[16rem] flex-1">
            <input
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="e.g. Johnson Family"
              className={inputClassName}
            />
          </AdminField>
          <AdminButton type="submit" variant="primary" disabled={creating || !newGroupName.trim()}>
            {creating ? "Adding…" : "Add group"}
          </AdminButton>
        </form>

        {groups.length ? (
          <ul className="mt-6 space-y-3">
            {groups.map((group) => {
              const code = group.loginCode || "";
              return (
                <li
                  key={group._id}
                  className="space-y-3 rounded-lg border border-[color:var(--line)] bg-white p-3"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      defaultValue={group.name}
                      onBlur={(e) => renameGroup(group._id, e.target.value, group.name)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                      aria-label={`Group name for ${group.name}`}
                      className="h-9 min-w-[12rem] flex-1 rounded-md border border-[color:var(--line)] bg-white px-2 text-ink outline-none focus-visible:border-ink"
                    />
                    <span className="text-xs text-pine">
                      {memberCount(group._id)} guest
                      {memberCount(group._id) === 1 ? "" : "s"} assigned
                    </span>
                    <button
                      type="button"
                      onClick={() => deleteGroup(group._id, group.name)}
                      className="text-xs font-medium text-red-800 hover:underline"
                    >
                      Delete
                    </button>
                  </div>

                  <div className="rounded-lg border border-dashed border-[color:var(--line)] bg-mist/40 p-3">
                    <p className="text-xs font-medium uppercase tracking-[0.08em] text-pine">
                      Shared group login
                    </p>
                    <p className="mt-1 font-mono text-lg tracking-[0.12em] text-ink">
                      {code || "Generating…"}
                    </p>
                    <p className="mt-1 text-xs text-pine">
                      Send this one code to everyone in the group. They all use the same vault
                      login — no per-person tickets needed for group photos.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <AdminButton
                        className="!h-8 !px-3 !text-xs"
                        disabled={!code}
                        onClick={() => {
                          void navigator.clipboard.writeText(code);
                          actions.setMessage(`Copied ${code}`);
                        }}
                      >
                        Copy code
                      </AdminButton>
                      <AdminButton
                        className="!h-8 !px-3 !text-xs"
                        disabled={!code}
                        onClick={() => {
                          void navigator.clipboard.writeText(vaultLoginUrl(code));
                          actions.setMessage("Copied vault link");
                        }}
                      >
                        Copy link
                      </AdminButton>
                      <AdminButton
                        className="!h-8 !px-3 !text-xs"
                        disabled={!code}
                        onClick={() => {
                          void navigator.clipboard.writeText(emailBlurb(group.name, code));
                          actions.setMessage("Copied email blurb");
                        }}
                      >
                        Copy email blurb
                      </AdminButton>
                      <AdminButton
                        className="!h-8 !px-3 !text-xs"
                        disabled={regenId === group._id}
                        onClick={() => void regenerateCode(group._id, group.name)}
                      >
                        {regenId === group._id ? "Updating…" : "New code"}
                      </AdminButton>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-6 text-sm text-pine">
            No groups yet. Add one above — you’ll get a shared login code to email the whole group.
          </p>
        )}
      </AdminPanel>

      <AdminPanel
        title="Assign guests to groups"
        description="Optional: tick people who also have individual tickets. Shared group logins are separate and already tied to their group."
      >
        {!groups.length ? (
          <p className="text-sm text-pine">Create a group first.</p>
        ) : !peopleGuests.length ? (
          <p className="text-sm text-pine">
            No individual guests yet. You can still use the shared group login code above, or
            import people on the Guests tab.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[color:var(--line)] text-left">
                  <th className="py-2 pr-3 font-medium text-pine">Guest</th>
                  {groups.map((group) => (
                    <th key={group._id} className="px-2 py-2 text-center font-medium text-pine">
                      {group.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {peopleGuests.map((guest) => (
                  <tr key={guest._id} className="border-b border-[color:var(--line)]/60">
                    <td className="py-2 pr-3 text-ink">
                      {guest.name}
                      <span className="ml-2 text-xs uppercase tracking-[0.08em] text-pine">
                        {guest.tier}
                      </span>
                    </td>
                    {groups.map((group) => {
                      const checked = (guest.groupIds || []).includes(group._id);
                      return (
                        <td key={group._id} className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => toggleGuestGroup(guest, group._id, e.target.checked)}
                            aria-label={`${guest.name} in ${group.name}`}
                            className="h-4 w-4"
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminPanel>
    </>
  );
}
