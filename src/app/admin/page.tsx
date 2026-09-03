"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminShell, type AdminTab } from "@/components/admin/AdminShell";
import { AdminButton, AdminField, inputClassName, textareaClassName } from "@/components/admin/ui";
import { OverviewTab } from "@/components/admin/OverviewTab";
import { EventTab } from "@/components/admin/EventTab";
import { GuestsTab } from "@/components/admin/GuestsTab";
import { MediaTab } from "@/components/admin/MediaTab";
import { EmailTab } from "@/components/admin/EmailTab";
import { AuditTab } from "@/components/admin/AuditTab";
import { Walkthrough } from "@/components/admin/Walkthrough";
import type { AdminActions, AdminData, DayDoc } from "@/components/admin/types";

function parseDayLabels(text: string, dayCount: number) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length) return lines;
  return Array.from({ length: dayCount }, (_, index) => `Day ${index + 1}`);
}

export default function AdminPage() {
  const router = useRouter();
  const [data, setData] = useState<AdminData | null>(null);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [message, setMessage] = useState("");

  // Event settings state (shared between tabs)
  const [newEventName, setNewEventName] = useState("");
  const [newEventDescription, setNewEventDescription] = useState("");
  const [newEventDayCount, setNewEventDayCount] = useState(5);
  const [newEventDayLabels, setNewEventDayLabels] = useState("");
  const [eventNameEdit, setEventNameEdit] = useState("");
  const [eventDescriptionEdit, setEventDescriptionEdit] = useState("");
  const [eventStartsOn, setEventStartsOn] = useState("");
  const [eventEndsOn, setEventEndsOn] = useState("");
  const [scheduleLabels, setScheduleLabels] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [showWalkthrough, setShowWalkthrough] = useState(false);

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
      if (json.event?._id) {
        setSelectedEventId(json.event._id);
        setEventNameEdit(json.event.name || "");
        setEventDescriptionEdit(json.event.description || "");
        setEventStartsOn(json.event.startsOn || "");
        setEventEndsOn(json.event.endsOn || "");
      }
      setScheduleLabels((json.days || []).map((day: DayDoc) => day.label));
    },
    [router],
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!data?.event) return;
    try {
      if (localStorage.getItem("ev_seen_walkthrough") === "1") return;
      localStorage.setItem("ev_seen_walkthrough", "1");
      setShowWalkthrough(true);
    } catch {
      // ignore storage errors
    }
  }, [data?.event]);

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

  const actions: AdminActions = { postAction, load, setMessage };

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
    setMessage(`Created "${json.event.name}" with ${json.days?.length || 0} day(s).`);
    setNewEventName("");
    setNewEventDescription("");
    setNewEventDayLabels("");
    await load(json.event._id);
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

        <div className="mt-6 rounded-2xl border border-gold/30 bg-gold/5 p-4 text-sm text-pine/80">
          <p className="font-medium text-ink">Getting started</p>
          <ol className="mt-2 list-decimal space-y-2 pl-5">
            <li>Create the event below (name, days, description).</li>
            <li>On <strong>Event</strong>, add one speaker session per talk (2–3 a day).</li>
            <li>On <strong>Media → YouTube sessions</strong>, paste each talk’s video URL.</li>
            <li>On <strong>Guests</strong>, import names, emails, and vip/standard.</li>
            <li>On <strong>Media</strong>, upload group and VIP photos.</li>
            <li>On <strong>Email</strong>, set up Gmail if you want ticket codes sent automatically.</li>
          </ol>
          <p className="mt-3 text-xs text-pine/70">After you create the event, use <strong>How to use</strong> in the header for a step-by-step walkthrough.</p>
        </div>

        {message ? (
          <p className="mt-4 rounded-2xl border border-gold/30 bg-gold/10 px-4 py-3 text-sm text-ink">{message}</p>
        ) : null}

        <form onSubmit={bootstrap} className="mt-8 space-y-4 rounded-2xl border border-[color:var(--line)] bg-white/90 p-6 shadow-sm">
          <AdminField label="Event name">
            <input value={newEventName} onChange={(e) => setNewEventName(e.target.value)} placeholder="Koinonia Retreat 2026" required className={inputClassName} />
          </AdminField>
          <AdminField label="Description" hint="Shown to guests on their vault page">
            <textarea value={newEventDescription} onChange={(e) => setNewEventDescription(e.target.value)} placeholder="Your private vault for retreat photos and sessions." rows={2} className={textareaClassName} />
          </AdminField>
          <div className="grid gap-4 sm:grid-cols-2">
            <AdminField label="Number of days">
              <select value={newEventDayCount} onChange={(e) => setNewEventDayCount(Number(e.target.value))} className={inputClassName}>
                {Array.from({ length: 14 }, (_, index) => (
                  <option key={index + 1} value={index + 1}>{index + 1} day{index === 0 ? "" : "s"}</option>
                ))}
              </select>
            </AdminField>
            <AdminField label="Custom day names" hint="One per line (optional)">
              <textarea value={newEventDayLabels} onChange={(e) => setNewEventDayLabels(e.target.value)} placeholder={"Day 1\nDay 2\nDay 3\nDay 4\nDay 5"} rows={3} className={`${textareaClassName} font-mono`} />
            </AdminField>
          </div>
          <AdminButton type="submit" variant="primary" className="h-11 w-full">Create event</AdminButton>
        </form>
      </main>
    );
  }

  const tabContent = {
    overview: (
      <OverviewTab
        data={data}
        selectedEventId={selectedEventId}
        eventDescriptionEdit={eventDescriptionEdit}
        applyingTemplate={false}
        savingEvent={false}
        setActiveTab={setActiveTab}
        setSelectedEventId={setSelectedEventId}
        actions={actions}
        eventStartsOn={eventStartsOn}
        eventEndsOn={eventEndsOn}
        setEventNameEdit={setEventNameEdit}
        setEventDescriptionEdit={setEventDescriptionEdit}
        setScheduleLabels={setScheduleLabels}
        onOpenWalkthrough={() => setShowWalkthrough(true)}
      />
    ),
    event: (
      <EventTab
        data={data}
        eventNameEdit={eventNameEdit}
        setEventNameEdit={setEventNameEdit}
        eventDescriptionEdit={eventDescriptionEdit}
        setEventDescriptionEdit={setEventDescriptionEdit}
        eventStartsOn={eventStartsOn}
        setEventStartsOn={setEventStartsOn}
        eventEndsOn={eventEndsOn}
        setEventEndsOn={setEventEndsOn}
        scheduleLabels={scheduleLabels}
        setScheduleLabels={setScheduleLabels}
        newEventName={newEventName}
        setNewEventName={setNewEventName}
        newEventDescription={newEventDescription}
        setNewEventDescription={setNewEventDescription}
        newEventDayCount={newEventDayCount}
        setNewEventDayCount={setNewEventDayCount}
        newEventDayLabels={newEventDayLabels}
        setNewEventDayLabels={setNewEventDayLabels}
        actions={actions}
      />
    ),
    guests: <GuestsTab data={data} selectedEventId={selectedEventId} actions={actions} setActiveTab={setActiveTab} />,
    media: <MediaTab data={data} selectedEventId={selectedEventId} actions={actions} />,
    email: <EmailTab data={data} setMessage={setMessage} />,
    audit: <AuditTab />,
  }[activeTab];

  return (
    <AdminShell
      eventName={data.event.name}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      message={message}
      onDismissMessage={() => setMessage("")}
      onSignOut={logout}
      onOpenGuide={() => setShowWalkthrough(true)}
    >
      {tabContent}
      <Walkthrough
        open={showWalkthrough}
        onClose={() => setShowWalkthrough(false)}
        onGoToTab={(tab) => {
          setActiveTab(tab);
          setShowWalkthrough(false);
        }}
      />
    </AdminShell>
  );
}
