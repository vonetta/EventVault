"use client";

import { FormEvent, useMemo, useState } from "react";
import type { AdminTab } from "@/components/admin/AdminShell";
import { AdminButton, AdminField, AdminPanel, TierBadge, inputClassName, textareaClassName } from "@/components/admin/ui";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { HowTo } from "@/components/admin/HowTo";
import type { AdminActions, AdminData } from "@/components/admin/types";

function parseGuestLines(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.includes('"')
        ? line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g)?.map((p) => p.replace(/^"|"$/g, "").trim())
        : line.split(",").map((part) => part.trim());
      const [name = "", email = "", tier = "standard"] = parts || [];
      return { name, email, tier: tier.toLowerCase() };
    })
    .filter((row) => row.name);
}

export function GuestsTab({
  data,
  selectedEventId,
  actions,
  setActiveTab,
}: {
  data: AdminData;
  selectedEventId: string;
  actions: AdminActions;
  setActiveTab: (tab: AdminTab) => void;
}) {
  const [guestCsv, setGuestCsv] = useState(
    "Jane Doe, jane@email.com, vip\nJohn Smith, john@email.com, standard",
  );
  const [sendEmailOnImport, setSendEmailOnImport] = useState(!!data.emailConfigured);
  const [guestSearch, setGuestSearch] = useState("");
  const [previewingGuestId, setPreviewingGuestId] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showEmailConfirm, setShowEmailConfirm] = useState(false);
  const [pendingImport, setPendingImport] = useState<{ guests: ReturnType<typeof parseGuestLines> } | null>(null);

  const filteredGuests = useMemo(() => {
    if (!guestSearch.trim()) return data.guests;
    const q = guestSearch.toLowerCase();
    return data.guests.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        g.email?.toLowerCase().includes(q) ||
        g.ticketCode.toLowerCase().includes(q),
    );
  }, [data.guests, guestSearch]);

  async function importGuests(event: FormEvent) {
    event.preventDefault();
    if (!data.event) return;
    const guests = parseGuestLines(guestCsv);
    if (!guests.length) {
      actions.setMessage("No valid guest lines found.");
      return;
    }

    if (sendEmailOnImport && guests.length > 5) {
      setPendingImport({ guests });
      setShowEmailConfirm(true);
      return;
    }

    await doImport(guests);
  }

  async function doImport(guests: ReturnType<typeof parseGuestLines>) {
    if (!data.event) return;
    setActionLoading("import");
    const json = await actions.postAction({
      action: "import_guests",
      eventId: data.event._id,
      guests,
      sendEmail: sendEmailOnImport,
    });
    setActionLoading(null);
    if (!json) return;
    const j = json as Record<string, unknown>;
    const emailNote = sendEmailOnImport
      ? ` Emailed ${j.emailed || 0}.${(j.emailErrors as unknown[])?.length ? ` ${(j.emailErrors as unknown[]).length} email error(s).` : ""}`
      : "";
    actions.setMessage(`Imported ${j.created || 0} new, updated ${j.updated || 0}.${emailNote}`);
    await actions.load(data.event._id);
  }

  async function copyCodes() {
    if (!data.guests.length) return;
    const text = data.guests
      .map((g) => `${g.name}\t${g.tier}\t${g.ticketCode}\t${g.email || ""}`)
      .join("\n");
    await navigator.clipboard.writeText(text);
    actions.setMessage("Ticket codes copied.");
  }

  async function regenerateCode(guestId: string) {
    setActionLoading(`regen-${guestId}`);
    const json = await actions.postAction({ action: "regenerate_code", guestId });
    setActionLoading(null);
    if (!json) return;
    actions.setMessage(`New code: ${(json as { guest: { ticketCode: string } }).guest.ticketCode}`);
    await actions.load(selectedEventId);
  }

  async function deleteGuest(guestId: string) {
    if (!confirm("Delete this guest?")) return;
    setActionLoading(`delete-${guestId}`);
    const json = await actions.postAction({ action: "delete_guest", guestId });
    setActionLoading(null);
    if (!json) return;
    actions.setMessage("Guest deleted.");
    await actions.load(selectedEventId);
  }

  async function emailTicket(guestId: string) {
    setActionLoading(`email-${guestId}`);
    const json = await actions.postAction({ action: "email_ticket", guestId });
    setActionLoading(null);
    if (!json) return;
    actions.setMessage("Ticket email sent.");
  }

  async function previewGuest(guestId: string) {
    setPreviewingGuestId(guestId);
    try {
      const response = await fetch("/api/admin/preview-guest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestId }),
      });
      const json = await response.json();
      if (!response.ok) {
        actions.setMessage(json.error || "Could not open guest preview");
        return;
      }
      window.location.assign("/vault");
    } catch {
      actions.setMessage("Could not open guest preview");
    } finally {
      setPreviewingGuestId("");
    }
  }

  return (
    <>
      <ConfirmDialog
        open={showEmailConfirm}
        title="Email all guests?"
        message={`You're about to email ticket codes to ${pendingImport?.guests.length || 0} guests. This will send real emails immediately.`}
        confirmLabel="Send emails"
        cancelLabel="Import without email"
        onConfirm={() => {
          setShowEmailConfirm(false);
          if (pendingImport) doImport(pendingImport.guests);
          setPendingImport(null);
        }}
        onCancel={() => {
          setShowEmailConfirm(false);
          setSendEmailOnImport(false);
          if (pendingImport) doImport(pendingImport.guests);
          setPendingImport(null);
        }}
      />

      <HowTo title="How to import guests" defaultOpen={!data.guests.length}>
        <p>Paste one person per line, then click <strong>Import guests</strong>.</p>
        <pre className="overflow-x-auto rounded-xl bg-white/80 p-3 font-mono text-xs text-ink">
{`Jane Doe, jane@email.com, vip
John Smith, john@email.com, standard`}
        </pre>
        <p>VIP guests see personal photos and speaker sessions. Standard guests see the group gallery only. Use <strong>View vault</strong> to check what someone will see.</p>
      </HowTo>

      <AdminPanel
        title="Import guests"
        description="One per line: Name, email, vip or standard. Same email updates the existing guest."
      >
        <form onSubmit={importGuests} className="space-y-4">
          <textarea
            value={guestCsv}
            onChange={(e) => setGuestCsv(e.target.value)}
            rows={6}
            aria-label="Guest list, one person per line: name, email, vip or standard"
            className={`${textareaClassName} font-mono`}
          />
          <label className="flex items-center gap-2 text-sm text-pine">
            <input
              type="checkbox"
              checked={sendEmailOnImport}
              onChange={(e) => setSendEmailOnImport(e.target.checked)}
              disabled={!data.emailConfigured}
              className="h-4 w-4 rounded border-[color:var(--line)]"
            />
            Email ticket codes on import
            {!data.emailConfigured ? (
              <button type="button" className="underline" onClick={() => setActiveTab("email")}>
                (set up Gmail first)
              </button>
            ) : null}
          </label>
          <div className="flex flex-wrap gap-2">
            <AdminButton type="submit" variant="primary" disabled={actionLoading === "import"}>
              {actionLoading === "import" ? "Importing…" : "Import guests"}
            </AdminButton>
            <AdminButton onClick={copyCodes}>Copy all codes</AdminButton>
          </div>
        </form>
      </AdminPanel>

      <AdminPanel
        title={`Guest list (${data.guests.length})`}
        description="Preview what each guest sees with View vault."
        action={
          data.guests.length > 5 ? (
            <AdminField label="Search guests" className="min-w-[14rem]">
              <input
                value={guestSearch}
                onChange={(e) => setGuestSearch(e.target.value)}
                placeholder="Search guests…"
                className={inputClassName}
              />
            </AdminField>
          ) : null
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <caption className="sr-only">Guest list</caption>
            <thead>
              <tr className="border-b border-[color:var(--line)] text-xs uppercase tracking-wide text-pine">
                <th scope="col" className="py-3 pr-4">Guest</th>
                <th scope="col" className="py-3 pr-4">Tier</th>
                <th scope="col" className="py-3 pr-4">Ticket</th>
                <th scope="col" className="py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredGuests.map((guest) => {
                const isLoading = (action: string) => actionLoading === `${action}-${guest._id}`;
                return (
                  <tr key={guest._id} className="border-b border-[color:var(--line)] last:border-0">
                    <td className="py-3 pr-4">
                      <p className="font-medium text-ink">{guest.name}</p>
                      {guest.email ? <p className="text-xs text-pine">{guest.email}</p> : null}
                    </td>
                    <td className="py-3 pr-4">
                      <TierBadge tier={guest.tier} />
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs tracking-wider">{guest.ticketCode}</td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <AdminButton
                          variant="primary"
                          className="!h-8 !px-3 !text-xs"
                          disabled={previewingGuestId === guest._id}
                          onClick={() => previewGuest(guest._id)}
                          aria-label={`View vault as ${guest.name}`}
                        >
                          {previewingGuestId === guest._id ? "Opening…" : "View vault"}
                        </AdminButton>
                        <AdminButton
                          className="!h-8 !px-2 !text-xs"
                          onClick={() => navigator.clipboard.writeText(guest.ticketCode)}
                          aria-label={`Copy ticket code for ${guest.name}`}
                        >
                          Copy
                        </AdminButton>
                        <AdminButton
                          className="!h-8 !px-2 !text-xs"
                          disabled={isLoading("regen")}
                          onClick={() => regenerateCode(guest._id)}
                          aria-label={`Regenerate ticket code for ${guest.name}`}
                        >
                          {isLoading("regen") ? "Working…" : "Regen"}
                        </AdminButton>
                        {guest.email && data.emailConfigured ? (
                          <AdminButton
                            className="!h-8 !px-2 !text-xs"
                            disabled={isLoading("email")}
                            onClick={() => emailTicket(guest._id)}
                            aria-label={`Email ticket code to ${guest.name}`}
                          >
                            {isLoading("email") ? "Sending…" : "Email"}
                          </AdminButton>
                        ) : null}
                        <AdminButton
                          variant="danger"
                          className="!h-8 !px-2 !text-xs"
                          disabled={isLoading("delete")}
                          onClick={() => deleteGuest(guest._id)}
                          aria-label={`Delete ${guest.name}`}
                        >
                          {isLoading("delete") ? "Deleting…" : "Delete"}
                        </AdminButton>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!filteredGuests.length ? (
            <p className="py-6 text-center text-sm text-pine">
              {guestSearch ? "No guests match your search." : "No guests imported yet."}
            </p>
          ) : null}
        </div>
      </AdminPanel>
    </>
  );
}
