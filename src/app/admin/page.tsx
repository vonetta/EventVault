"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type EventDoc = { _id: string; name: string; slug: string; description?: string };
type DayDoc = { _id: string; label: string; sortOrder: number };
type SessionDoc = {
  _id: string;
  dayId: string;
  title: string;
  speaker?: string;
  startsAt?: string;
};
type GuestDoc = {
  _id: string;
  name: string;
  email?: string;
  tier: "vip" | "standard";
  ticketCode: string;
};
type MediaDoc = {
  _id: string;
  kind: string;
  title?: string;
  filename: string;
  guestId?: string | null;
  sessionId?: string | null;
  storageProvider?: string;
  youtubeId?: string;
  youtubePlaylistId?: string;
  availableUntil?: string | null;
};

type AdminData = {
  event: EventDoc | null;
  events: EventDoc[];
  days: DayDoc[];
  sessions: SessionDoc[];
  guests: GuestDoc[];
  media: MediaDoc[];
  emailConfigured?: boolean;
};

function parseGuestLines(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      // Split on commas not inside quotes; fall back to simple 3-part split
      const parts = line.includes('"')
        ? line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g)?.map((p) => p.replace(/^"|"$/g, "").trim())
        : line.split(",").map((part) => part.trim());
      const [name = "", email = "", tier = "standard"] = parts || [];
      return { name, email, tier: tier.toLowerCase() };
    })
    .filter((row) => row.name);
}

export default function AdminPage() {
  const router = useRouter();
  const [data, setData] = useState<AdminData | null>(null);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [message, setMessage] = useState("");
  const [guestCsv, setGuestCsv] = useState(
    "Jane Doe, jane@email.com, vip\nJohn Smith, john@email.com, standard",
  );
  const [sendEmailOnImport, setSendEmailOnImport] = useState(false);
  const [newEventName, setNewEventName] = useState("");
  const [sessionTitle, setSessionTitle] = useState("");
  const [sessionSpeaker, setSessionSpeaker] = useState("");
  const [sessionDayId, setSessionDayId] = useState("");
  const [uploadKind, setUploadKind] = useState("group_photo");
  const [uploadGuestId, setUploadGuestId] = useState("");
  const [uploadSessionId, setUploadSessionId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeTitle, setYoutubeTitle] = useState("");
  const [youtubeSessionId, setYoutubeSessionId] = useState("");
  const [youtubeUntil, setYoutubeUntil] = useState("");

  const load = useCallback(
    async (eventId?: string) => {
      const query = eventId ? `?eventId=${encodeURIComponent(eventId)}` : "";
      const response = await fetch(`/api/admin/data${query}`);
      if (response.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (!response.ok) {
        setMessage("Could not load admin data");
        return;
      }
      const json = await response.json();
      setData({
        event: json.event,
        events: json.events || [],
        days: json.days || [],
        sessions: json.sessions || [],
        guests: json.guests || [],
        media: json.media || [],
        emailConfigured: Boolean(json.emailConfigured),
      });
      if (json.event?._id) setSelectedEventId(json.event._id);
      if (json.days?.[0]?._id) setSessionDayId(json.days[0]._id);
      if (json.sessions?.[0]?._id) {
        setUploadSessionId((prev) => prev || json.sessions[0]._id);
        setYoutubeSessionId((prev) => prev || json.sessions[0]._id);
      }
    },
    [router],
  );

  useEffect(() => {
    load();
  }, [load]);

  const vipGuests = useMemo(
    () => (data?.guests || []).filter((guest) => guest.tier === "vip"),
    [data],
  );

  async function postAction(payload: Record<string, unknown>) {
    const response = await fetch("/api/admin/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await response.json();
    if (!response.ok) {
      setMessage(json.error || "Action failed");
      return null;
    }
    return json;
  }

  async function bootstrap(event: FormEvent) {
    event.preventDefault();
    const json = await postAction({
      action: "bootstrap",
      name: "Weekend Gathering",
      slug: "weekend-gathering",
      days: ["Day 1", "Day 2", "Day 3"],
    });
    if (!json) return;
    setMessage("Event ready with Day 1–3.");
    await load();
  }

  async function createEvent(event: FormEvent) {
    event.preventDefault();
    if (!newEventName.trim()) return;
    const json = await postAction({
      action: "create_event",
      name: newEventName.trim(),
      days: ["Day 1", "Day 2", "Day 3"],
    });
    if (!json) return;
    setNewEventName("");
    setMessage(`Created event “${json.event.name}”.`);
    await load(json.event._id);
  }

  async function addSession(event: FormEvent) {
    event.preventDefault();
    if (!data?.event) return;
    const json = await postAction({
      action: "add_session",
      eventId: data.event._id,
      dayId: sessionDayId,
      title: sessionTitle,
      speaker: sessionSpeaker,
    });
    if (!json) return;
    setSessionTitle("");
    setSessionSpeaker("");
    setMessage("Session added.");
    await load(data.event._id);
  }

  async function importGuests(event: FormEvent) {
    event.preventDefault();
    if (!data?.event) return;
    const guests = parseGuestLines(guestCsv);
    if (!guests.length) {
      setMessage("No valid guest lines found.");
      return;
    }
    const json = await postAction({
      action: "import_guests",
      eventId: data.event._id,
      guests,
      sendEmail: sendEmailOnImport,
    });
    if (!json) return;
    const emailNote =
      sendEmailOnImport
        ? ` Emailed ${json.emailed || 0}.${json.emailErrors?.length ? ` ${json.emailErrors.length} email error(s).` : ""}`
        : "";
    setMessage(
      `Imported ${json.created || 0} new, updated ${json.updated || 0}.${emailNote}`,
    );
    await load(data.event._id);
  }

  async function copyCodes() {
    if (!data?.guests.length) return;
    const text = data.guests
      .map((g) => `${g.name}\t${g.tier}\t${g.ticketCode}\t${g.email || ""}`)
      .join("\n");
    await navigator.clipboard.writeText(text);
    setMessage("Ticket codes copied.");
  }

  async function regenerateCode(guestId: string) {
    const json = await postAction({ action: "regenerate_code", guestId });
    if (!json) return;
    setMessage(`New code: ${json.guest.ticketCode}`);
    await load(selectedEventId);
  }

  async function deleteGuest(guestId: string) {
    if (!confirm("Delete this guest?")) return;
    const json = await postAction({ action: "delete_guest", guestId });
    if (!json) return;
    setMessage("Guest deleted.");
    await load(selectedEventId);
  }

  async function emailTicket(guestId: string) {
    const json = await postAction({ action: "email_ticket", guestId });
    if (!json) return;
    setMessage("Ticket email sent.");
  }

  async function deleteMedia(mediaId: string) {
    if (!confirm("Remove this media record?")) return;
    const json = await postAction({ action: "delete_media", mediaId });
    if (!json) return;
    setMessage("Media removed.");
    await load(selectedEventId);
  }

  async function addYoutubeSession(event: FormEvent) {
    event.preventDefault();
    if (!data?.event) return;
    const json = await postAction({
      action: "add_youtube_session",
      eventId: data.event._id,
      sessionId: youtubeSessionId,
      youtubeUrl,
      title: youtubeTitle || undefined,
      availableUntil: youtubeUntil || undefined,
    });
    if (!json) return;
    setYoutubeUrl("");
    setYoutubeTitle("");
    setMessage(
      youtubeUntil
        ? `YouTube session linked (available until ${youtubeUntil}). Use Unlisted on YouTube.`
        : "YouTube session linked. Use Unlisted on YouTube.",
    );
    await load(data.event._id);
  }

  async function uploadMedia(event: FormEvent) {
    event.preventDefault();
    if (!data?.event || !file) return;

    const form = new FormData();
    form.set("file", file);
    form.set("eventId", data.event._id);
    form.set("kind", uploadKind);
    form.set("title", file.name);
    if (uploadKind === "personal_photo") form.set("guestId", uploadGuestId);
    if (uploadKind === "session_video") form.set("sessionId", uploadSessionId);

    const response = await fetch("/api/admin/upload", {
      method: "POST",
      body: form,
    });
    const json = await response.json();
    if (!response.ok) {
      setMessage(json.error || "Upload failed");
      return;
    }
    setFile(null);
    setMessage("Media uploaded.");
    await load(data.event._id);
  }

  async function logout() {
    await fetch("/api/auth/admin/logout", { method: "POST" });
    window.location.assign("/admin/login");
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-16">
        <p className="text-pine/70">Loading admin…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-8 md:px-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-[family-name:var(--font-fraunces)] text-3xl text-ink">EventVault</p>
          <h1 className="mt-2 font-[family-name:var(--font-fraunces)] text-4xl text-ink">Admin</h1>
        </div>
        <button
          onClick={logout}
          className="rounded-full border border-[color:var(--line)] bg-white/70 px-4 py-2 text-sm"
        >
          Sign out
        </button>
      </header>

      {message ? (
        <p className="rounded-2xl border border-[color:var(--line)] bg-white/70 px-4 py-3 text-sm text-pine">
          {message}
        </p>
      ) : null}

      {!data.event ? (
        <form onSubmit={bootstrap} className="space-y-3 rounded-2xl border border-[color:var(--line)] bg-white/70 p-5">
          <h2 className="font-[family-name:var(--font-fraunces)] text-2xl">Create first event</h2>
          <p className="text-sm text-pine/75">
            Sets up one event with Day 1, Day 2, and Day 3 ready for sessions.
          </p>
          <button type="submit" className="h-11 rounded-2xl bg-ink px-4 text-foam">
            Create 3-day event
          </button>
        </form>
      ) : (
        <>
          <section className="space-y-3 rounded-2xl border border-[color:var(--line)] bg-white/70 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm text-pine" htmlFor="event-switch">
                Active event
              </label>
              <select
                id="event-switch"
                value={selectedEventId}
                onChange={(e) => {
                  setSelectedEventId(e.target.value);
                  load(e.target.value);
                }}
                className="h-11 min-w-[12rem] rounded-xl border border-[color:var(--line)] bg-white px-3"
              >
                {data.events.map((event) => (
                  <option key={event._id} value={event._id}>
                    {event.name}
                  </option>
                ))}
              </select>
            </div>
            <h2 className="font-[family-name:var(--font-fraunces)] text-2xl">{data.event.name}</h2>
            <p className="mt-1 text-sm text-pine/75">
              {data.days.map((day) => day.label).join(" · ")} · {data.guests.length} guests ·{" "}
              {data.media.length} media files
            </p>
            <form onSubmit={createEvent} className="flex flex-wrap gap-2 pt-2">
              <input
                value={newEventName}
                onChange={(e) => setNewEventName(e.target.value)}
                placeholder="New event name"
                className="h-11 flex-1 rounded-xl border border-[color:var(--line)] bg-white px-3"
              />
              <button type="submit" className="h-11 rounded-xl border border-[color:var(--line)] px-4">
                Add event
              </button>
            </form>
          </section>

          <section className="space-y-3 rounded-2xl border border-[color:var(--line)] bg-white/70 p-5">
            <h2 className="font-[family-name:var(--font-fraunces)] text-2xl">Add session</h2>
            <form onSubmit={addSession} className="grid gap-3 md:grid-cols-2">
              <select
                value={sessionDayId}
                onChange={(e) => setSessionDayId(e.target.value)}
                className="h-11 rounded-xl border border-[color:var(--line)] bg-white px-3"
              >
                {data.days.map((day) => (
                  <option key={day._id} value={day._id}>
                    {day.label}
                  </option>
                ))}
              </select>
              <input
                value={sessionTitle}
                onChange={(e) => setSessionTitle(e.target.value)}
                placeholder="Session title"
                required
                className="h-11 rounded-xl border border-[color:var(--line)] bg-white px-3"
              />
              <input
                value={sessionSpeaker}
                onChange={(e) => setSessionSpeaker(e.target.value)}
                placeholder="Speaker"
                className="h-11 rounded-xl border border-[color:var(--line)] bg-white px-3"
              />
              <button type="submit" className="h-11 rounded-xl bg-ink text-foam">
                Add session
              </button>
            </form>
            <ul className="space-y-2 text-sm text-pine">
              {data.sessions.map((session) => {
                const day = data.days.find((item) => item._id === session.dayId);
                return (
                  <li key={session._id}>
                    {day?.label}: {session.title}
                    {session.speaker ? ` — ${session.speaker}` : ""}
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="space-y-3 rounded-2xl border border-[color:var(--line)] bg-white/70 p-5">
            <h2 className="font-[family-name:var(--font-fraunces)] text-2xl">Import guests</h2>
            <p className="text-sm text-pine/75">
              One per line: <code>Name, email, vip|standard</code>. Same email updates the existing
              guest. Ticket codes are auto-generated.
            </p>
            <form onSubmit={importGuests} className="space-y-3">
              <textarea
                value={guestCsv}
                onChange={(e) => setGuestCsv(e.target.value)}
                rows={6}
                className="w-full rounded-xl border border-[color:var(--line)] bg-white p-3 font-mono text-sm"
              />
              <label className="flex items-center gap-2 text-sm text-pine">
                <input
                  type="checkbox"
                  checked={sendEmailOnImport}
                  onChange={(e) => setSendEmailOnImport(e.target.checked)}
                  disabled={!data.emailConfigured}
                />
                Email ticket codes on import
                {!data.emailConfigured ? " (set RESEND_API_KEY + EMAIL_FROM)" : ""}
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="submit" className="h-11 rounded-xl bg-ink px-4 text-foam">
                  Generate ticket codes
                </button>
                <button
                  type="button"
                  onClick={copyCodes}
                  className="h-11 rounded-xl border border-[color:var(--line)] px-4"
                >
                  Copy all codes
                </button>
              </div>
            </form>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-pine/70">
                    <th className="py-2">Name</th>
                    <th>Tier</th>
                    <th>Ticket code</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.guests.map((guest) => (
                    <tr key={guest._id} className="border-t border-[color:var(--line)]">
                      <td className="py-2">
                        {guest.name}
                        {guest.email ? (
                          <span className="block text-xs text-pine/60">{guest.email}</span>
                        ) : null}
                      </td>
                      <td>{guest.tier}</td>
                      <td className="font-mono tracking-wider">{guest.ticketCode}</td>
                      <td className="space-x-2 whitespace-nowrap py-2">
                        <button
                          type="button"
                          className="underline"
                          onClick={() => navigator.clipboard.writeText(guest.ticketCode)}
                        >
                          Copy
                        </button>
                        <button type="button" className="underline" onClick={() => regenerateCode(guest._id)}>
                          Regen
                        </button>
                        {guest.email && data.emailConfigured ? (
                          <button type="button" className="underline" onClick={() => emailTicket(guest._id)}>
                            Email
                          </button>
                        ) : null}
                        <button type="button" className="underline" onClick={() => deleteGuest(guest._id)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-3 rounded-2xl border border-[color:var(--line)] bg-white/70 p-5">
            <h2 className="font-[family-name:var(--font-fraunces)] text-2xl">
              Session video / playlist (YouTube)
            </h2>
            <p className="text-sm text-pine/75">
              Upload videos to YouTube as <strong>Unlisted</strong>, then paste either a{" "}
              <strong>single video</strong> link or a <strong>playlist</strong> link. Guests can
              move through the whole playlist in the vault. Optional end date hides it after that
              day (also unpublish on YouTube when done).
            </p>
            <form onSubmit={addYoutubeSession} className="grid gap-3 md:grid-cols-2">
              <select
                value={youtubeSessionId}
                onChange={(e) => setYoutubeSessionId(e.target.value)}
                required
                className="h-11 rounded-xl border border-[color:var(--line)] bg-white px-3"
              >
                <option value="">Select session</option>
                {data.sessions.map((session) => (
                  <option key={session._id} value={session._id}>
                    {session.title}
                  </option>
                ))}
              </select>
              <input
                value={youtubeTitle}
                onChange={(e) => setYoutubeTitle(e.target.value)}
                placeholder="Title (optional)"
                className="h-11 rounded-xl border border-[color:var(--line)] bg-white px-3"
              />
              <input
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="Video or playlist URL (youtu.be/…, watch?v=…, playlist?list=…)"
                required
                className="h-11 rounded-xl border border-[color:var(--line)] bg-white px-3 md:col-span-2"
              />
              <label className="text-sm text-pine md:col-span-2">
                Available until (optional)
                <input
                  type="date"
                  value={youtubeUntil}
                  onChange={(e) => setYoutubeUntil(e.target.value)}
                  className="mt-1 h-11 w-full rounded-xl border border-[color:var(--line)] bg-white px-3"
                />
              </label>
              <button type="submit" className="h-11 rounded-xl bg-ink text-foam md:col-span-2">
                Link YouTube video or playlist
              </button>
            </form>
          </section>

          <section className="space-y-3 rounded-2xl border border-[color:var(--line)] bg-white/70 p-5">
            <h2 className="font-[family-name:var(--font-fraunces)] text-2xl">Upload photos</h2>
            <p className="text-sm text-pine/75">
              Photos stay on EventVault/R2 (private). Prefer YouTube above for session videos to save
              storage. Photos: JPEG/PNG/WebP/GIF up to 15MB. Personal photos are VIP-only in the vault.
            </p>
            <form onSubmit={uploadMedia} className="grid gap-3 md:grid-cols-2">
              <select
                value={uploadKind}
                onChange={(e) => setUploadKind(e.target.value)}
                className="h-11 rounded-xl border border-[color:var(--line)] bg-white px-3"
              >
                <option value="group_photo">Group gallery photo</option>
                <option value="personal_photo">VIP personal photo</option>
                <option value="session_video">Session file (fallback)</option>
              </select>

              {uploadKind === "personal_photo" ? (
                <select
                  value={uploadGuestId}
                  onChange={(e) => setUploadGuestId(e.target.value)}
                  required
                  className="h-11 rounded-xl border border-[color:var(--line)] bg-white px-3"
                >
                  <option value="">Select VIP guest</option>
                  {vipGuests.map((guest) => (
                    <option key={guest._id} value={guest._id}>
                      {guest.name}
                    </option>
                  ))}
                </select>
              ) : null}

              {uploadKind === "session_video" ? (
                <select
                  value={uploadSessionId}
                  onChange={(e) => setUploadSessionId(e.target.value)}
                  required
                  className="h-11 rounded-xl border border-[color:var(--line)] bg-white px-3"
                >
                  <option value="">Select session</option>
                  {data.sessions.map((session) => (
                    <option key={session._id} value={session._id}>
                      {session.title}
                    </option>
                  ))}
                </select>
              ) : null}

              <input
                type="file"
                accept={
                  uploadKind === "session_video"
                    ? "image/*,video/mp4,video/webm,video/quicktime"
                    : "image/jpeg,image/png,image/webp,image/gif"
                }
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                required
                className="md:col-span-2"
              />
              <button type="submit" className="h-11 rounded-xl bg-ink text-foam md:col-span-2">
                Upload
              </button>
            </form>
            <ul className="space-y-1 text-sm text-pine">
              {data.media.slice(0, 20).map((item) => (
                <li key={item._id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {item.kind}
                    {item.storageProvider === "youtube"
                      ? item.youtubePlaylistId
                        ? " (YouTube playlist)"
                        : " (YouTube)"
                      : ""}
                    : {item.title || item.filename}
                    {item.availableUntil
                      ? ` · until ${new Date(item.availableUntil).toLocaleDateString()}`
                      : ""}
                  </span>
                  <button type="button" className="underline" onClick={() => deleteMedia(item._id)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
