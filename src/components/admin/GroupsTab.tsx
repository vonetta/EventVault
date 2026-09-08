"use client";

import { FormEvent, useState } from "react";
import { AdminButton, AdminField, AdminPanel, inputClassName } from "@/components/admin/ui";
import type { AdminActions, AdminData, GuestDoc } from "@/components/admin/types";

export function GroupsTab({
  data,
  actions,
}: {
  data: AdminData;
  actions: AdminActions;
}) {
  const [newGroupName, setNewGroupName] = useState("");
  const [creating, setCreating] = useState(false);

  const groups = data.groups || [];

  function memberCount(groupId: string) {
    return data.guests.filter((guest) => (guest.groupIds || []).includes(groupId)).length;
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
    setNewGroupName("");
    actions.setMessage("Group created.");
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
    if (!confirm(`Delete the group "${name}"? Guests will be removed from it and any photos sent only to this group will return to the Main gallery.`)) {
      return;
    }
    const json = await actions.postAction({ action: "delete_group", groupId });
    if (!json) return;
    actions.setMessage("Group deleted.");
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
        description="Create groups (e.g. families or small groups). You decide which team photos each group sees on the Media tab."
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
          <ul className="mt-6 space-y-2">
            {groups.map((group) => (
              <li
                key={group._id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-[color:var(--line)] bg-white px-3 py-2"
              >
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
                  {memberCount(group._id)} guest{memberCount(group._id) === 1 ? "" : "s"}
                </span>
                <button
                  type="button"
                  onClick={() => deleteGroup(group._id, group.name)}
                  className="text-xs font-medium text-red-800 hover:underline"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-6 text-sm text-pine">No groups yet. Add one above to start organizing guests.</p>
        )}
      </AdminPanel>

      <AdminPanel
        title="Assign guests to groups"
        description="Tick the groups each guest belongs to. A guest can be in more than one."
      >
        {!groups.length ? (
          <p className="text-sm text-pine">Create a group first.</p>
        ) : !data.guests.length ? (
          <p className="text-sm text-pine">Import guests on the Guests tab first.</p>
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
                {data.guests.map((guest) => (
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
