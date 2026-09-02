"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MediaGrid, type MediaItem } from "@/components/MediaGrid";
import { AdminShell, type AdminTab } from "@/components/admin/AdminShell";
import {
  AdminButton,
  AdminField,
  AdminPanel,
  StatCard,
  StatusBadge,
  TierBadge,
  inputClassName,
  textareaClassName,
} from "@/components/admin/ui";
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
  name: "Koinonia Retreat 2026",
  description:
    "Your private vault for Koinonia Retreat photos and speaker sessions. VIP guests also receive personal photo galleries.",
  dayLabels: ["Thursday", "Friday", "Saturday", "Sunday", "Monday"],
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
  const [newEventDayCount, setNewEventDayCount] = useState(5);
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
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");

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
      <main className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-6">
        <p className="text-pine/70">Loading admin…</p>
      </main>
    );
  }

  if (!data.event) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-6 py-12">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-pine/60">EventVault Admin</p>
        <h1 className="mt-2 font-[family-name:var(--font-fraunces)] text-4xl text-ink">Create your event</h1>
        <p className="mt-2 text-pine/75">Set up Koinonia Retreat or any ticketed event.</p>

        {message ? (
          <p className="mt-4 rounded-2xl border border-gold/30 bg-gold/10 px-4 py-3 text-sm text-ink">
            {message}
          </p>
        ) : null}

        <form onSubmit={bootstrap} className="mt-8 space-y-4 rounded-2xl border border-[color:var(--line)] bg-white/90 p-6 shadow-sm">
          <AdminField label="Event name">
            <input
              value={newEventName}
              onChange={(e) => setNewEventName(e.target.value)}
              placeholder="Koinonia Retreat 2026"
              required
              className={inputClassName}
            />
          </AdminField>
          <AdminField label="Description" hint="Shown to guests on their vault page">
            <textarea
              value={newEventDescription}
              onChange={(e) => setNewEventDescription(e.target.value)}
              placeholder="Your private vault for retreat photos and sessions."
              rows={2}
              className={textareaClassName}
            />
          </AdminField>
          <div className="grid gap-4 sm:grid-cols-2">
            <AdminField label="Number of days">
              <select
                value={newEventDayCount}
                onChange={(e) => setNewEventDayCount(Number(e.target.value))}
                className={inputClassName}
              >
                {Array.from({ length: 14 }, (_, index) => (
                  <option key={index + 1} value={index + 1}>
                    {index + 1} day{index === 0 ? "" : "s"}
                  </option>
                ))}
              </select>
            </AdminField>
            <AdminField label="Custom day names" hint="One per line (optional)">
              <textarea
                value={newEventDayLabels}
                onChange={(e) => setNewEventDayLabels(e.target.value)}
                placeholder={"Thursday\nFriday\nSaturday\nSunday\nMonday"}
                rows={3}
                className={`${textareaClassName} font-mono`}
              />
            </AdminField>
          </div>
          <AdminButton type="submit" variant="primary" className="h-11 w-full">
            Create event
          </AdminButton>
        </form>
      </main>
    );
  }

  const overviewContent = (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Guests" value={data.guests.length} />
        <StatCard label="Media files" value={data.media.length} />
        <StatCard label="Sessions" value={data.sessions.length} />
        <StatCard label="Days" value={data.days.length} />
      </div>

      <AdminPanel
        title="Active event"
        description={data.days.map((day) => day.label).join(" · ")}
        action={
          data.events.length > 1 ? (
            <select
              id="event-switch"
              value={selectedEventId}
              onChange={(e) => {
                setSelectedEventId(e.target.value);
                load(e.target.value);
              }}
              className={`${inputClassName} !w-auto min-w-[12rem]`}
            >
              {data.events.map((event) => (
                <option key={event._id} value={event._id}>
                  {event.name}
                </option>
              ))}
            </select>
          ) : null
        }
      >
        <p className="text-sm text-pine/80">{eventDescriptionEdit || "No description yet."}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <AdminButton variant="primary" onClick={() => setActiveTab("event")}>
            Edit event
          </AdminButton>
          <AdminButton onClick={() => setActiveTab("guests")}>
            Manage guests
          </AdminButton>
          <AdminButton onClick={() => setActiveTab("media")}>
            Upload media
          </AdminButton>
          <AdminButton
            onClick={applyRetreatTemplate}
            disabled={applyingTemplate || savingEvent}
          >
            {applyingTemplate ? "Applying…" : "Apply Koinonia template"}
          </AdminButton>
        </div>
      </AdminPanel>

      <AdminPanel title="Email status">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge tone={data.emailConfigured ? "success" : "warning"}>
            {data.emailConfigured ? "Gmail configured" : "Gmail not configured"}
          </StatusBadge>
          {!data.emailConfigured ? (
            <AdminButton onClick={() => setActiveTab("email")}>Set up email</AdminButton>
          ) : null}
        </div>
      </AdminPanel>
    </>
  );

  const eventContent = (
    <>
      <AdminPanel
        title="Event details"
        description="Name and description guests see when they open their vault."
        action={
          <AdminButton
            onClick={applyRetreatTemplate}
            disabled={applyingTemplate || savingEvent}
          >
            {applyingTemplate ? "Applying…" : "Koinonia template"}
          </AdminButton>
        }
      >
        <div className="grid gap-4">
          <AdminField label="Event name">
            <input
              value={eventNameEdit}
              onChange={(e) => setEventNameEdit(e.target.value)}
              className={inputClassName}
            />
          </AdminField>
          <AdminField label="Guest-facing description">
            <textarea
              value={eventDescriptionEdit}
              onChange={(e) => setEventDescriptionEdit(e.target.value)}
              rows={3}
              className={textareaClassName}
            />
          </AdminField>
          <div className="grid gap-4 sm:grid-cols-2">
            <AdminField label="Starts on">
              <input
                type="date"
                value={eventStartsOn}
                onChange={(e) => setEventStartsOn(e.target.value)}
                className={inputClassName}
              />
            </AdminField>
            <AdminField label="Ends on">
              <input
                type="date"
                value={eventEndsOn}
                onChange={(e) => setEventEndsOn(e.target.value)}
                className={inputClassName}
              />
            </AdminField>
          </div>
          <AdminButton
            variant="primary"
            onClick={() => saveEventSettingsAndNotify()}
            disabled={savingEvent}
            className="w-full sm:w-auto"
          >
            {savingEvent ? "Saving…" : "Save changes"}
          </AdminButton>
        </div>
      </AdminPanel>

      <AdminPanel
        title="Retreat days"
        description="Rename days to match your schedule."
        action={
          <AdminButton onClick={addDay}>Add day</AdminButton>
        }
      >
        <ul className="space-y-2">
          {data.days.map((day) => (
            <li
              key={day._id}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-[color:var(--line)] bg-mist/30 p-2"
            >
              <input
                value={dayLabelEdits[day._id] ?? day.label}
                onChange={(e) =>
                  setDayLabelEdits((prev) => ({ ...prev, [day._id]: e.target.value }))
                }
                className={`${inputClassName} min-w-[10rem] flex-1`}
              />
              <AdminButton onClick={() => saveDayLabel(day._id)}>Save</AdminButton>
              <AdminButton variant="danger" onClick={() => removeDay(day._id)}>
                Remove
              </AdminButton>
            </li>
          ))}
        </ul>
      </AdminPanel>

      <AdminPanel title="Speaker sessions" description="Create sessions before linking YouTube videos.">
        <form onSubmit={addSession} className="grid gap-3 sm:grid-cols-2">
          <AdminField label="Day">
            <select
              value={sessionDayId}
              onChange={(e) => setSessionDayId(e.target.value)}
              className={inputClassName}
            >
              {data.days.map((day) => (
                <option key={day._id} value={day._id}>
                  {day.label}
                </option>
              ))}
            </select>
          </AdminField>
          <AdminField label="Session title">
            <input
              value={sessionTitle}
              onChange={(e) => setSessionTitle(e.target.value)}
              placeholder="Morning worship"
              required
              className={inputClassName}
            />
          </AdminField>
          <AdminField label="Speaker" className="sm:col-span-2">
            <input
              value={sessionSpeaker}
              onChange={(e) => setSessionSpeaker(e.target.value)}
              placeholder="Optional"
              className={inputClassName}
            />
          </AdminField>
          <AdminButton type="submit" variant="primary" className="sm:col-span-2 sm:w-auto">
            Add session
          </AdminButton>
        </form>
        {data.sessions.length ? (
          <ul className="mt-4 space-y-2">
            {data.sessions.map((session) => {
              const day = data.days.find((item) => item._id === session.dayId);
              return (
                <li
                  key={session._id}
                  className="rounded-xl border border-[color:var(--line)] bg-white px-3 py-2 text-sm text-pine"
                >
                  <span className="font-medium text-ink">{session.title}</span>
                  <span className="text-pine/70">
                    {" "}
                    · {day?.label}
                    {session.speaker ? ` · ${session.speaker}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-pine/70">No sessions yet.</p>
        )}
      </AdminPanel>

      <details className="rounded-2xl border border-[color:var(--line)] bg-white/60 p-4">
        <summary className="cursor-pointer text-sm font-medium text-pine">
          Add another event (advanced)
        </summary>
        <form onSubmit={createEvent} className="mt-4 space-y-3">
          <input
            value={newEventName}
            onChange={(e) => setNewEventName(e.target.value)}
            placeholder="New event name"
            className={inputClassName}
          />
          <textarea
            value={newEventDescription}
            onChange={(e) => setNewEventDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
            className={textareaClassName}
          />
          <AdminButton type="submit">Add event</AdminButton>
        </form>
      </details>
    </>
  );

  const guestsContent = (
    <>
      <AdminPanel
        title="Import guests"
        description="One per line: Name, email, vip or standard. Same email updates the existing guest."
      >
        <form onSubmit={importGuests} className="space-y-4">
          <textarea
            value={guestCsv}
            onChange={(e) => setGuestCsv(e.target.value)}
            rows={6}
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
            <AdminButton type="submit" variant="primary">
              Import guests
            </AdminButton>
            <AdminButton onClick={copyCodes}>Copy all codes</AdminButton>
          </div>
        </form>
      </AdminPanel>

      <AdminPanel title={`Guest list (${data.guests.length})`} description="Preview what each guest sees with View vault.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead>
              <tr className="border-b border-[color:var(--line)] text-xs uppercase tracking-wide text-pine/60">
                <th className="py-3 pr-4">Guest</th>
                <th className="py-3 pr-4">Tier</th>
                <th className="py-3 pr-4">Ticket</th>
                <th className="py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.guests.map((guest) => (
                <tr key={guest._id} className="border-b border-[color:var(--line)] last:border-0">
                  <td className="py-3 pr-4">
                    <p className="font-medium text-ink">{guest.name}</p>
                    {guest.email ? (
                      <p className="text-xs text-pine/60">{guest.email}</p>
                    ) : null}
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
                      >
                        {previewingGuestId === guest._id ? "…" : "View vault"}
                      </AdminButton>
                      <AdminButton
                        className="!h-8 !px-2 !text-xs"
                        onClick={() => navigator.clipboard.writeText(guest.ticketCode)}
                      >
                        Copy
                      </AdminButton>
                      <AdminButton
                        className="!h-8 !px-2 !text-xs"
                        onClick={() => regenerateCode(guest._id)}
                      >
                        Regen
                      </AdminButton>
                      {guest.email && data.emailConfigured ? (
                        <AdminButton
                          className="!h-8 !px-2 !text-xs"
                          onClick={() => emailTicket(guest._id)}
                        >
                          Email
                        </AdminButton>
                      ) : null}
                      <AdminButton
                        variant="danger"
                        className="!h-8 !px-2 !text-xs"
                        onClick={() => deleteGuest(guest._id)}
                      >
                        Delete
                      </AdminButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.guests.length ? (
            <p className="py-6 text-center text-sm text-pine/70">No guests imported yet.</p>
          ) : null}
        </div>
      </AdminPanel>
    </>
  );

  const mediaContent = (
    <>
      <AdminPanel
        title="Media library"
        description={`${data.media.length} file${data.media.length === 1 ? "" : "s"} for this event`}
        action={
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["all", "All"],
                ["group_photo", "Group"],
                ["personal_photo", "VIP"],
                ["session_video", "Sessions"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setMediaFilter(value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  mediaFilter === value ? "bg-ink text-foam" : "bg-mist text-pine"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        }
      >
        <MediaGrid
          items={filteredMediaItems}
          emptyMessage="No media yet — upload photos below."
          onRemove={deleteMedia}
        />
      </AdminPanel>

      <AdminPanel
        title="Upload photos"
        description="Group gallery for everyone. VIP personal photos go to one guest only."
      >
        <form onSubmit={uploadMedia} className="grid gap-4">
          <AdminField label="Photo type">
            <select
              value={uploadKind}
              onChange={(e) => {
                setUploadKind(e.target.value);
                setFile(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              className={inputClassName}
            >
              <option value="group_photo">Group gallery photo</option>
              <option value="personal_photo">VIP personal photo</option>
              <option value="session_video">Session file (fallback)</option>
            </select>
          </AdminField>

          {uploadKind === "personal_photo" ? (
            <AdminField label="VIP guest">
              <select
                value={uploadGuestId}
                onChange={(e) => setUploadGuestId(e.target.value)}
                required
                className={inputClassName}
              >
                <option value="">Select VIP guest</option>
                {vipGuests.map((guest) => (
                  <option key={guest._id} value={guest._id}>
                    {guest.name}
                  </option>
                ))}
              </select>
            </AdminField>
          ) : null}

          {uploadKind === "session_video" ? (
            <AdminField label="Session">
              <select
                value={uploadSessionId}
                onChange={(e) => setUploadSessionId(e.target.value)}
                required
                className={inputClassName}
              >
                <option value="">Select session</option>
                {data.sessions.map((session) => (
                  <option key={session._id} value={session._id}>
                    {session.title}
                  </option>
                ))}
              </select>
            </AdminField>
          ) : null}

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
            className="flex min-h-[9rem] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-pine/25 bg-mist/40 px-4 py-6 text-center transition hover:border-gold/50 hover:bg-mist/70"
          >
            <span className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-foam">
              Choose photo
            </span>
            <span className="text-sm text-pine/80">
              {file ? (
                <>
                  Selected: <strong className="text-ink">{file.name}</strong>
                </>
              ) : (
                "JPEG, PNG, WebP, or GIF · under 4MB on Vercel"
              )}
            </span>
          </label>

          <AdminButton type="submit" variant="primary" disabled={!file} className="w-full sm:w-auto">
            {file ? `Upload ${file.name}` : "Choose a file first"}
          </AdminButton>
        </form>
      </AdminPanel>

      <AdminPanel
        title="YouTube sessions"
        description="Upload to YouTube as Unlisted, then paste a video or playlist link."
      >
        <form onSubmit={addYoutubeSession} className="grid gap-4 sm:grid-cols-2">
          <AdminField label="Session">
            <select
              value={youtubeSessionId}
              onChange={(e) => setYoutubeSessionId(e.target.value)}
              required
              className={inputClassName}
            >
              <option value="">Select session</option>
              {data.sessions.map((session) => (
                <option key={session._id} value={session._id}>
                  {session.title}
                </option>
              ))}
            </select>
          </AdminField>
          <AdminField label="Title (optional)">
            <input
              value={youtubeTitle}
              onChange={(e) => setYoutubeTitle(e.target.value)}
              className={inputClassName}
            />
          </AdminField>
          <AdminField label="YouTube URL" className="sm:col-span-2">
            <input
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="youtu.be/… or playlist?list=…"
              required
              className={inputClassName}
            />
          </AdminField>
          <AdminField label="Available until (optional)" className="sm:col-span-2">
            <input
              type="date"
              value={youtubeUntil}
              onChange={(e) => setYoutubeUntil(e.target.value)}
              className={inputClassName}
            />
          </AdminField>
          <AdminButton type="submit" variant="primary" className="sm:col-span-2 sm:w-auto">
            Link YouTube
          </AdminButton>
        </form>
      </AdminPanel>
    </>
  );

  const emailContent = (
    <AdminPanel
      title="Ticket email (Gmail)"
      description="Automatically email ticket codes when you import guests."
      action={
        <StatusBadge tone={data.emailConfigured ? "success" : "warning"}>
          {data.emailConfigured ? "Configured" : "Not configured"}
        </StatusBadge>
      }
    >
      {data.emailConfigured ? (
        <div className="space-y-4 text-sm text-pine/80">
          <p>
            Sending as <strong>{data.email?.fromName}</strong>
            {data.email?.gmailUser ? ` (${data.email.gmailUser})` : ""} · Links use{" "}
            <strong>{data.email?.appUrl}</strong>
          </p>
          <form onSubmit={sendTestEmail} className="flex flex-wrap items-end gap-3">
            <AdminField label="Send test email to" className="min-w-[14rem] flex-1">
              <input
                type="email"
                value={testEmailTo}
                onChange={(e) => setTestEmailTo(e.target.value)}
                placeholder="you@gmail.com"
                className={inputClassName}
              />
            </AdminField>
            <AdminButton type="submit" disabled={sendingTestEmail}>
              {sendingTestEmail ? "Sending…" : "Send test"}
            </AdminButton>
          </form>
        </div>
      ) : (
        <div className="space-y-4 text-sm text-pine/80">
          <p>Add these in <strong>Vercel → Settings → Environment Variables</strong>, then redeploy:</p>
          <pre className="overflow-x-auto rounded-xl bg-mist/80 p-4 font-mono text-xs text-ink">
{`GMAIL_USER=vonettastevenson@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
APP_URL=https://event-vault-dusky.vercel.app
EMAIL_FROM_NAME=Koinonia Retreat`}
          </pre>
          <ol className="list-decimal space-y-2 pl-5">
            <li>Turn on <strong>2-Step Verification</strong> on the Google account.</li>
            <li>
              Create an App Password at{" "}
              <a
                href="https://myaccount.google.com/apppasswords"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                myaccount.google.com/apppasswords
              </a>
            </li>
            <li>Redeploy Vercel, refresh this page, then send a test email.</li>
          </ol>
        </div>
      )}
    </AdminPanel>
  );

  const tabContent = {
    overview: overviewContent,
    event: eventContent,
    guests: guestsContent,
    media: mediaContent,
    email: emailContent,
  }[activeTab];

  return (
    <AdminShell
      eventName={data.event.name}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      message={message}
      onDismissMessage={() => setMessage("")}
      onSignOut={logout}
    >
      {tabContent}
    </AdminShell>
  );
}
