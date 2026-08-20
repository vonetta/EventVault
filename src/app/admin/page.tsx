"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
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
};

type AdminData = {
  event: EventDoc | null;
  days: DayDoc[];
  sessions: SessionDoc[];
  guests: GuestDoc[];
  media: MediaDoc[];
};

export default function AdminPage() {
  const router = useRouter();
  const [data, setData] = useState<AdminData | null>(null);
  const [message, setMessage] = useState("");
  const [guestCsv, setGuestCsv] = useState("Jane Doe, jane@email.com, vip\nJohn Smith, john@email.com, standard");
  const [sessionTitle, setSessionTitle] = useState("");
  const [sessionSpeaker, setSessionSpeaker] = useState("");
  const [sessionDayId, setSessionDayId] = useState("");
  const [uploadKind, setUploadKind] = useState("group_photo");
  const [uploadGuestId, setUploadGuestId] = useState("");
  const [uploadSessionId, setUploadSessionId] = useState("");
  const [file, setFile] = useState<File | null>(null);

  async function load() {
    const response = await fetch("/api/admin/data");
    if (response.status === 401) {
      router.replace("/admin/login");
      return;
    }
    const json = await response.json();
    setData({
      event: json.event,
      days: json.days || [],
      sessions: json.sessions || [],
      guests: json.guests || [],
      media: json.media || [],
    });
    if (json.days?.[0]?._id) setSessionDayId(json.days[0]._id);
  }

  useEffect(() => {
    load();
  }, [router]);

  const vipGuests = useMemo(
    () => (data?.guests || []).filter((guest) => guest.tier === "vip"),
    [data],
  );

  async function bootstrap(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/admin/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "bootstrap",
        name: "Weekend Gathering",
        slug: "weekend-gathering",
        days: ["Day 1", "Day 2", "Day 3"],
      }),
    });
    const json = await response.json();
    if (!response.ok) {
      setMessage(json.error || "Could not create event");
      return;
    }
    setMessage("Event ready with Day 1–3.");
    await load();
  }

  async function addSession(event: FormEvent) {
    event.preventDefault();
    if (!data?.event) return;
    const response = await fetch("/api/admin/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "add_session",
        eventId: data.event._id,
        dayId: sessionDayId,
        title: sessionTitle,
        speaker: sessionSpeaker,
      }),
    });
    const json = await response.json();
    if (!response.ok) {
      setMessage(json.error || "Could not add session");
      return;
    }
    setSessionTitle("");
    setSessionSpeaker("");
    setMessage("Session added.");
    await load();
  }

  async function importGuests(event: FormEvent) {
    event.preventDefault();
    if (!data?.event) return;

    const guests = guestCsv
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, email, tier] = line.split(",").map((part) => part.trim());
        return { name, email, tier };
      });

    const response = await fetch("/api/admin/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "import_guests",
        eventId: data.event._id,
        guests,
      }),
    });
    const json = await response.json();
    if (!response.ok) {
      setMessage(json.error || "Import failed");
      return;
    }
    setMessage(`Created ${json.count} guests with ticket codes.`);
    await load();
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
    await load();
  }

  async function logout() {
    await fetch("/api/auth/admin/logout", { method: "POST" });
    router.replace("/admin/login");
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
          <section className="rounded-2xl border border-[color:var(--line)] bg-white/70 p-5">
            <h2 className="font-[family-name:var(--font-fraunces)] text-2xl">{data.event.name}</h2>
            <p className="mt-1 text-sm text-pine/75">
              {data.days.map((day) => day.label).join(" · ")} · {data.guests.length} guests ·{" "}
              {data.media.length} media files
            </p>
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
              One per line: <code>Name, email, vip|standard</code>. Ticket codes are generated
              automatically.
            </p>
            <form onSubmit={importGuests} className="space-y-3">
              <textarea
                value={guestCsv}
                onChange={(e) => setGuestCsv(e.target.value)}
                rows={6}
                className="w-full rounded-xl border border-[color:var(--line)] bg-white p-3 font-mono text-sm"
              />
              <button type="submit" className="h-11 rounded-xl bg-ink px-4 text-foam">
                Generate ticket codes
              </button>
            </form>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-pine/70">
                    <th className="py-2">Name</th>
                    <th>Tier</th>
                    <th>Ticket code</th>
                  </tr>
                </thead>
                <tbody>
                  {data.guests.map((guest) => (
                    <tr key={guest._id} className="border-t border-[color:var(--line)]">
                      <td className="py-2">{guest.name}</td>
                      <td>{guest.tier}</td>
                      <td className="font-mono tracking-wider">{guest.ticketCode}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-3 rounded-2xl border border-[color:var(--line)] bg-white/70 p-5">
            <h2 className="font-[family-name:var(--font-fraunces)] text-2xl">Upload media</h2>
            <form onSubmit={uploadMedia} className="grid gap-3 md:grid-cols-2">
              <select
                value={uploadKind}
                onChange={(e) => setUploadKind(e.target.value)}
                className="h-11 rounded-xl border border-[color:var(--line)] bg-white px-3"
              >
                <option value="group_photo">Group gallery photo</option>
                <option value="personal_photo">VIP personal photo</option>
                <option value="session_video">Session video</option>
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
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                required
                className="md:col-span-2"
              />
              <button type="submit" className="h-11 rounded-xl bg-ink text-foam md:col-span-2">
                Upload
              </button>
            </form>
            <ul className="space-y-1 text-sm text-pine">
              {data.media.slice(0, 12).map((item) => (
                <li key={item._id}>
                  {item.kind}: {item.title || item.filename}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
