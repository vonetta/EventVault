"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MediaGrid, type MediaItem } from "@/components/MediaGrid";
import { youtubeEmbedForRef, youtubeOpenUrlForRef } from "@/lib/youtube";

type EventDoc = {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  startsOn?: string;
  endsOn?: string;
};
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
  contentType?: string;
  guestId?: string | null;
  sessionId?: string | null;
  storageProvider?: string;
  youtubeId?: string;
  youtubePlaylistId?: string;
  availableUntil?: string | null;
};

type MediaFilter = "all" | "group_photo" | "personal_photo" | "session_video";

type AdminData = {
  event: EventDoc | null;
  events: EventDoc[];
  days: DayDoc[];
  sessions: SessionDoc[];
  guests: GuestDoc[];
  media: MediaDoc[];
  emailConfigured?: boolean;
  email?: {
    configured: boolean;
    appUrl: string;
    fromName: string;
    gmailUser: string | null;
  };
};

const RETREAT_TEMPLATE = {
  name: "Salt & Light Retreat 2026",
  description:
    "Your private vault for retreat photos and speaker sessions. VIP guests also receive personal photo galleries.",
  dayLabels: ["Friday", "Saturday", "Sunday"],
};

function parseDayLabels(text: string, dayCount: number) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length) return lines;
  return Array.from({ length: dayCount }, (_, index) => `Day ${index + 1}`);
}

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

function mediaKindLabel(kind: string) {
  if (kind === "group_photo") return "Group gallery";
  if (kind === "personal_photo") return "VIP personal";
  if (kind === "session_video") return "Session";
  return kind;
}

function mapAdminMediaItem(
  item: MediaDoc,
  guests: GuestDoc[],
  sessions: SessionDoc[],
): MediaItem | null {
  const baseTitle = item.title || item.filename;

  if (item.storageProvider === "youtube") {
    if (item.youtubePlaylistId) {
      const ref = { type: "playlist" as const, id: item.youtubePlaylistId };
      return {
        id: item._id,
        title: baseTitle,
        contentType: "video/youtube-playlist",
        provider: "youtube",
        url: youtubeOpenUrlForRef(ref),
        embedUrl: youtubeEmbedForRef(ref),
        availableUntil: item.availableUntil,
      };
    }
    if (item.youtubeId) {
      const ref = { type: "video" as const, id: item.youtubeId };
      return {
        id: item._id,
        title: baseTitle,
        contentType: "video/youtube",
        provider: "youtube",
        url: youtubeOpenUrlForRef(ref),
        embedUrl: youtubeEmbedForRef(ref),
        availableUntil: item.availableUntil,
      };
    }
  }

  const guest = guests.find((g) => g._id === item.guestId);
  const session = sessions.find((s) => s._id === item.sessionId);
  const suffix = guest ? ` · ${guest.name}` : session ? ` · ${session.title}` : "";

  return {
    id: item._id,
    title: `${mediaKindLabel(item.kind)}${suffix ? suffix : ""}: ${baseTitle}`,
    contentType: item.contentType || "image/jpeg",
    url: `/api/media/${item._id}`,
    availableUntil: item.availableUntil,
  };
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
  const [newEventDescription, setNewEventDescription] = useState("");
  const [newEventDayCount, setNewEventDayCount] = useState(3);
  const [newEventDayLabels, setNewEventDayLabels] = useState("");
  const [eventNameEdit, setEventNameEdit] = useState("");
  const [eventDescriptionEdit, setEventDescriptionEdit] = useState("");
  const [eventStartsOn, setEventStartsOn] = useState("");
  const [eventEndsOn, setEventEndsOn] = useState("");
  const [dayLabelEdits, setDayLabelEdits] = useState<Record<string, string>>({});
  const [sessionTitle, setSessionTitle] = useState("");
  const [sessionSpeaker, setSessionSpeaker] = useState("");
  const [sessionDayId, setSessionDayId] = useState("");
  const [uploadKind, setUploadKind] = useState("group_photo");
  const [uploadGuestId, setUploadGuestId] = useState("");
  const [uploadSessionId, setUploadSessionId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeTitle, setYoutubeTitle] = useState("");
  const [youtubeSessionId, setYoutubeSessionId] = useState("");
  const [youtubeUntil, setYoutubeUntil] = useState("");
  const [savingEvent, setSavingEvent] = useState(false);
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>("all");
  const [previewingGuestId, setPreviewingGuestId] = useState("");
  const [testEmailTo, setTestEmailTo] = useState("");
  const [sendingTestEmail, setSendingTestEmail] = useState(false);
  const [applyingTemplate, setApplyingTemplate] = useState(false);

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
        email: json.email,
      });
      if (json.emailConfigured) {
        setSendEmailOnImport(true);
      }
      if (json.event?._id) {
        setSelectedEventId(json.event._id);
        setEventNameEdit(json.event.name || "");
        setEventDescriptionEdit(json.event.description || "");
        setEventStartsOn(json.event.startsOn || "");
        setEventEndsOn(json.event.endsOn || "");
      }
      const labels: Record<string, string> = {};
      for (const day of json.days || []) labels[day._id] = day.label;
      setDayLabelEdits(labels);
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

  const filteredMediaItems = useMemo(() => {
    if (!data) return [];
    const items = data.media
      .filter((item) => mediaFilter === "all" || item.kind === mediaFilter)
      .map((item) => mapAdminMediaItem(item, data.guests, data.sessions))
      .filter((item): item is MediaItem => Boolean(item));
    return items;
  }, [data, mediaFilter]);

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
    if (!newEventName.trim()) {
      setMessage("Enter an event name.");
      return;
    }
    const json = await postAction({
      action: "bootstrap",
      name: newEventName.trim(),
      description: newEventDescription.trim() || undefined,
      days: parseDayLabels(newEventDayLabels, newEventDayCount),
      dayCount: newEventDayCount,
    });
    if (!json) return;
    setMessage(`Created “${json.event.name}” with ${json.days?.length || 0} day(s).`);
    setNewEventName("");
    setNewEventDescription("");
    setNewEventDayLabels("");
    await load(json.event._id);
  }

  async function createEvent(event: FormEvent) {
    event.preventDefault();
    if (!newEventName.trim()) return;
    const json = await postAction({
      action: "create_event",
      name: newEventName.trim(),
      description: newEventDescription.trim() || undefined,
      days: parseDayLabels(newEventDayLabels, newEventDayCount),
      dayCount: newEventDayCount,
    });
    if (!json) return;
    setNewEventName("");
    setNewEventDescription("");
    setNewEventDayLabels("");
    setMessage(`Created event “${json.event.name}”.`);
    await load(json.event._id);
  }

  async function saveEventSettings(event?: FormEvent) {
    event?.preventDefault();
    if (!data?.event) return false;
    const name = eventNameEdit.trim();
    if (!name) {
      setMessage("Enter an event name before saving.");
      return false;
    }
    setSavingEvent(true);
    const json = await postAction({
      action: "update_event",
      eventId: data.event._id,
      name,
      description: eventDescriptionEdit.trim(),
      startsOn: eventStartsOn.trim(),
      endsOn: eventEndsOn.trim(),
    });
    setSavingEvent(false);
    if (!json) return false;
    return true;
  }

  async function applyRetreatTemplate() {
    if (!data?.event) return;
    if (
      !confirm(
        `Apply the retreat template?\n\n• ${RETREAT_TEMPLATE.name}\n• Day names: ${RETREAT_TEMPLATE.dayLabels.join(", ")}\n\nYou can still edit dates before saving.`,
      )
    ) {
      return;
    }

    setApplyingTemplate(true);
    setEventNameEdit(RETREAT_TEMPLATE.name);
    setEventDescriptionEdit(RETREAT_TEMPLATE.description);

    const nextDayLabels = { ...dayLabelEdits };
    data.days.forEach((day, index) => {
      const label = RETREAT_TEMPLATE.dayLabels[index];
      if (label) nextDayLabels[day._id] = label;
    });
    setDayLabelEdits(nextDayLabels);

    setSavingEvent(true);
    const json = await postAction({
      action: "update_event",
      eventId: data.event._id,
      name: RETREAT_TEMPLATE.name,
      description: RETREAT_TEMPLATE.description,
      startsOn: eventStartsOn.trim(),
      endsOn: eventEndsOn.trim(),
    });
    setSavingEvent(false);
    if (!json) {
      setApplyingTemplate(false);
      return;
    }

    for (const day of data.days) {
      const label = nextDayLabels[day._id]?.trim();
      if (!label || label === day.label) continue;
      const json = await postAction({ action: "update_day", dayId: day._id, label });
      if (!json) {
        setApplyingTemplate(false);
        return;
      }
    }

    setApplyingTemplate(false);
    setMessage("Retreat template applied. Adjust dates above if needed, then save again.");
    await load(data.event._id);
  }

  async function saveEventSettingsAndNotify(event?: FormEvent) {
    const saved = await saveEventSettings(event);
    if (!saved || !data?.event) return;
    setMessage("Event settings saved.");
    await load(data.event._id);
  }

  async function sendTestEmail(event: FormEvent) {
    event.preventDefault();
    const to = testEmailTo.trim();
    if (!to) {
      setMessage("Enter an email address for the test.");
      return;
    }

    setSendingTestEmail(true);
    try {
      const response = await fetch("/api/admin/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to }),
      });
      const json = await response.json();
      if (!response.ok) {
        setMessage(json.error || "Test email failed");
        return;
      }
      setMessage(`Test email sent to ${json.to}. Check your inbox (and spam).`);
    } catch {
      setMessage("Test email failed");
    } finally {
      setSendingTestEmail(false);
    }
  }

  async function saveDayLabel(dayId: string) {
    const label = dayLabelEdits[dayId]?.trim();
    if (!label) {
      setMessage("Day name cannot be empty.");
      return;
    }
    const json = await postAction({ action: "update_day", dayId, label });
    if (!json) return;
    setMessage("Day renamed.");
    await load(selectedEventId);
  }

  async function addDay() {
    if (!data?.event) return;
    const json = await postAction({ action: "add_day", eventId: data.event._id });
    if (!json) return;
    setMessage(`Added “${json.day.label}”.`);
    await load(data.event._id);
  }

  async function removeDay(dayId: string) {
    if (!confirm("Delete this day? You must remove its sessions first.")) return;
    const json = await postAction({ action: "delete_day", dayId });
    if (!json) return;
    setMessage("Day removed.");
    await load(selectedEventId);
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
        setMessage(json.error || "Could not open guest preview");
        return;
      }
      window.location.assign("/vault");
    } catch {
      setMessage("Could not open guest preview");
    } finally {
      setPreviewingGuestId("");
    }
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
        <form
          onSubmit={bootstrap}
          className="space-y-4 rounded-2xl border border-[color:var(--line)] bg-white/70 p-5"
        >
          <h2 className="font-[family-name:var(--font-fraunces)] text-2xl">Create first event</h2>
          <p className="text-sm text-pine/75">
            Name your event and choose how many days (or enter custom day names).
          </p>
          <input
            value={newEventName}
            onChange={(e) => setNewEventName(e.target.value)}
            placeholder="Event name (e.g. Salt & Light Retreat 2026)"
            required
            className="h-11 w-full rounded-xl border border-[color:var(--line)] bg-white px-3"
          />
          <textarea
            value={newEventDescription}
            onChange={(e) => setNewEventDescription(e.target.value)}
            placeholder="Short description (optional)"
            rows={2}
            className="w-full rounded-xl border border-[color:var(--line)] bg-white p-3 text-sm"
          />
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm text-pine">
              Number of days
              <select
                value={newEventDayCount}
                onChange={(e) => setNewEventDayCount(Number(e.target.value))}
                className="mt-1 h-11 w-full rounded-xl border border-[color:var(--line)] bg-white px-3"
              >
                {Array.from({ length: 14 }, (_, index) => (
                  <option key={index + 1} value={index + 1}>
                    {index + 1} day{index === 0 ? "" : "s"}
                  </option>
                ))}
              </select>
            </label>
            <p className="self-end text-sm text-pine/70">
              Or override with custom names below (one per line).
            </p>
          </div>
          <textarea
            value={newEventDayLabels}
            onChange={(e) => setNewEventDayLabels(e.target.value)}
            placeholder={"Custom day names (optional)\nFriday\nSaturday\nSunday"}
            rows={4}
            className="w-full rounded-xl border border-[color:var(--line)] bg-white p-3 font-mono text-sm"
          />
          <button type="submit" className="h-11 rounded-2xl bg-ink px-4 text-foam">
            Create event
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
          </section>

          <section className="space-y-4 rounded-2xl border border-[color:var(--line)] bg-white/70 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-[family-name:var(--font-fraunces)] text-2xl">Ticket email (Gmail)</h2>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  data.emailConfigured
                    ? "bg-emerald-100 text-emerald-900"
                    : "bg-amber-100 text-amber-900"
                }`}
              >
                {data.emailConfigured ? "Configured" : "Not configured"}
              </span>
            </div>

            {data.emailConfigured ? (
              <div className="space-y-3 text-sm text-pine/80">
                <p>
                  Sending from <strong>{data.email?.fromName}</strong>
                  {data.email?.gmailUser ? ` (${data.email.gmailUser})` : ""}. Links use{" "}
                  <strong>{data.email?.appUrl}</strong>.
                </p>
                <p>
                  Import guests with <strong>Email ticket codes on import</strong> checked, or tap
                  <strong> Email</strong> on any guest row.
                </p>
                <form onSubmit={sendTestEmail} className="flex flex-wrap items-end gap-2">
                  <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-sm text-pine">
                    Send test email to
                    <input
                      type="email"
                      value={testEmailTo}
                      onChange={(e) => setTestEmailTo(e.target.value)}
                      placeholder="you@gmail.com"
                      className="h-11 rounded-xl border border-[color:var(--line)] bg-white px-3"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={sendingTestEmail}
                    className="h-11 rounded-xl border border-[color:var(--line)] px-4"
                  >
                    {sendingTestEmail ? "Sending…" : "Send test"}
                  </button>
                </form>
              </div>
            ) : (
              <div className="space-y-3 text-sm text-pine/80">
                <p>Add these in <strong>Vercel → Project → Settings → Environment Variables</strong>, then redeploy:</p>
                <pre className="overflow-x-auto rounded-xl bg-mist/80 p-3 font-mono text-xs text-ink">
{`GMAIL_USER=vonettastevenson@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
APP_URL=https://event-vault-dusky.vercel.app
EMAIL_FROM_NAME=Salt & Light Retreat`}
                </pre>
                <ol className="list-decimal space-y-2 pl-5">
                  <li>
                    Turn on <strong>2-Step Verification</strong> for the Google account.
                  </li>
                  <li>
                    Create an App Password:{" "}
                    <a
                      href="https://myaccount.google.com/apppasswords"
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      myaccount.google.com/apppasswords
                    </a>
                  </li>
                  <li>Paste the 16-character password into <code>GMAIL_APP_PASSWORD</code> (spaces are fine).</li>
                  <li>Redeploy Vercel, refresh this page, then send a test email.</li>
                </ol>
              </div>
            )}
          </section>

          <section className="relative z-10 space-y-4 rounded-2xl border border-[color:var(--line)] bg-white/70 p-5">
            <h2 className="font-[family-name:var(--font-fraunces)] text-2xl">Event settings</h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={applyRetreatTemplate}
                disabled={applyingTemplate || savingEvent}
                className="h-9 rounded-xl border border-[color:var(--line)] px-3 text-sm"
              >
                {applyingTemplate ? "Applying…" : "Apply Salt & Light retreat template"}
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <input
                value={eventNameEdit}
                onChange={(e) => setEventNameEdit(e.target.value)}
                placeholder="Event name"
                className="h-11 rounded-xl border border-[color:var(--line)] bg-white px-3 md:col-span-2"
              />
              <textarea
                value={eventDescriptionEdit}
                onChange={(e) => setEventDescriptionEdit(e.target.value)}
                placeholder="Description shown to guests (optional)"
                rows={2}
                className="w-full rounded-xl border border-[color:var(--line)] bg-white p-3 text-sm md:col-span-2"
              />
              <label className="text-sm text-pine">
                Starts on
                <input
                  type="date"
                  value={eventStartsOn}
                  onChange={(e) => setEventStartsOn(e.target.value)}
                  className="mt-1 h-11 w-full rounded-xl border border-[color:var(--line)] bg-white px-3"
                />
              </label>
              <label className="text-sm text-pine">
                Ends on
                <input
                  type="date"
                  value={eventEndsOn}
                  onChange={(e) => setEventEndsOn(e.target.value)}
                  className="mt-1 h-11 w-full rounded-xl border border-[color:var(--line)] bg-white px-3"
                />
              </label>
              <button
                type="button"
                onClick={() => saveEventSettingsAndNotify()}
                disabled={savingEvent}
                className="h-11 cursor-pointer rounded-xl bg-ink text-foam md:col-span-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingEvent ? "Saving…" : "Save event settings"}
              </button>
            </div>

            <div className="space-y-2 border-t border-[color:var(--line)] pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-semibold text-ink">Days</h3>
                <button
                  type="button"
                  onClick={addDay}
                  className="h-9 rounded-xl border border-[color:var(--line)] px-3 text-sm"
                >
                  Add day
                </button>
              </div>
              <ul className="space-y-2">
                {data.days.map((day) => (
                  <li key={day._id} className="flex flex-wrap items-center gap-2">
                    <input
                      value={dayLabelEdits[day._id] ?? day.label}
                      onChange={(e) =>
                        setDayLabelEdits((prev) => ({ ...prev, [day._id]: e.target.value }))
                      }
                      className="h-10 min-w-[10rem] flex-1 rounded-xl border border-[color:var(--line)] bg-white px-3 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => saveDayLabel(day._id)}
                      className="h-10 rounded-xl border border-[color:var(--line)] px-3 text-sm"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => removeDay(day._id)}
                      className="h-10 rounded-xl border border-[color:var(--line)] px-3 text-sm text-red-800"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="space-y-3 rounded-2xl border border-[color:var(--line)] bg-white/70 p-5">
            <h2 className="font-[family-name:var(--font-fraunces)] text-2xl">Add another event</h2>
            <form onSubmit={createEvent} className="space-y-3">
              <input
                value={newEventName}
                onChange={(e) => setNewEventName(e.target.value)}
                placeholder="New event name"
                className="h-11 w-full rounded-xl border border-[color:var(--line)] bg-white px-3"
              />
              <textarea
                value={newEventDescription}
                onChange={(e) => setNewEventDescription(e.target.value)}
                placeholder="Description (optional)"
                rows={2}
                className="w-full rounded-xl border border-[color:var(--line)] bg-white p-3 text-sm"
              />
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm text-pine">
                  Number of days
                  <select
                    value={newEventDayCount}
                    onChange={(e) => setNewEventDayCount(Number(e.target.value))}
                    className="mt-1 h-11 w-full rounded-xl border border-[color:var(--line)] bg-white px-3"
                  >
                    {Array.from({ length: 14 }, (_, index) => (
                      <option key={index + 1} value={index + 1}>
                        {index + 1} day{index === 0 ? "" : "s"}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <textarea
                value={newEventDayLabels}
                onChange={(e) => setNewEventDayLabels(e.target.value)}
                placeholder="Custom day names (optional, one per line)"
                rows={3}
                className="w-full rounded-xl border border-[color:var(--line)] bg-white p-3 font-mono text-sm"
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
            <h2 className="font-[family-name:var(--font-fraunces)] text-2xl">Guests & preview</h2>
            <p className="text-sm text-pine/75">
              Use <strong>View vault</strong> to see exactly what that guest sees — group gallery,
              personal photos (VIP), and sessions.
            </p>
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
                {!data.emailConfigured ? " (set GMAIL_USER + GMAIL_APP_PASSWORD)" : ""}
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
                          className="rounded-full bg-ink px-3 py-1 text-xs text-foam"
                          disabled={previewingGuestId === guest._id}
                          onClick={() => previewGuest(guest._id)}
                        >
                          {previewingGuestId === guest._id ? "Opening…" : "View vault"}
                        </button>
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
              <strong>Step 1:</strong> pick photo type · <strong>Step 2:</strong> tap the box below to
              choose a file · <strong>Step 3:</strong> Upload. JPEG/PNG/WebP/GIF up to 4MB on Vercel.
            </p>
            <form onSubmit={uploadMedia} className="grid gap-3 md:grid-cols-2">
              <select
                value={uploadKind}
                onChange={(e) => {
                  setUploadKind(e.target.value);
                  setFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="h-11 rounded-xl border border-[color:var(--line)] bg-white px-3 md:col-span-2"
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
                  className="h-11 rounded-xl border border-[color:var(--line)] bg-white px-3 md:col-span-2"
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
                  className="h-11 rounded-xl border border-[color:var(--line)] bg-white px-3 md:col-span-2"
                >
                  <option value="">Select session</option>
                  {data.sessions.map((session) => (
                    <option key={session._id} value={session._id}>
                      {session.title}
                    </option>
                  ))}
                </select>
              ) : null}

              <div className="md:col-span-2">
                <input
                  ref={fileInputRef}
                  id="photo-upload-input"
                  type="file"
                  accept={
                    uploadKind === "session_video"
                      ? "image/*,video/mp4,video/webm,video/quicktime"
                      : "image/jpeg,image/png,image/webp,image/gif"
                  }
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="sr-only"
                />
                <label
                  htmlFor="photo-upload-input"
                  className="flex min-h-[8rem] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-pine/35 bg-mist/60 px-4 py-6 text-center transition hover:border-pine/60 hover:bg-mist"
                >
                  <span className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-foam">
                    Choose photo from device
                  </span>
                  <span className="text-sm text-pine/80">
                    {file ? (
                      <>
                        Selected: <strong className="text-ink">{file.name}</strong>
                      </>
                    ) : (
                      "Tap here to browse — or drag a file onto this box"
                    )}
                  </span>
                </label>
              </div>
              <button
                type="submit"
                disabled={!file}
                className="h-12 rounded-xl bg-ink text-base font-medium text-foam md:col-span-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {file ? `Upload ${file.name}` : "Upload (choose a file first)"}
              </button>
            </form>
          </section>

          <section className="space-y-4 rounded-2xl border border-[color:var(--line)] bg-white/70 p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-[family-name:var(--font-fraunces)] text-2xl">Media library</h2>
                <p className="mt-1 text-sm text-pine/75">
                  {data.media.length} file{data.media.length === 1 ? "" : "s"} uploaded for this event.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["all", "All"],
                    ["group_photo", "Group"],
                    ["personal_photo", "VIP personal"],
                    ["session_video", "Sessions"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setMediaFilter(value)}
                    className={`rounded-full px-3 py-1 text-sm ${
                      mediaFilter === value
                        ? "bg-ink text-foam"
                        : "border border-[color:var(--line)] text-pine"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <MediaGrid
              items={filteredMediaItems}
              emptyMessage="No media in this category yet."
              onRemove={deleteMedia}
            />
          </section>
        </>
      )}
    </main>
  );
}
