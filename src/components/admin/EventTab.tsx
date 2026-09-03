"use client";

import { FormEvent, useMemo, useState } from "react";
import { HowTo } from "@/components/admin/HowTo";
import { AdminButton, AdminField, AdminPanel, inputClassName, textareaClassName } from "@/components/admin/ui";
import type { AdminActions, AdminData } from "@/components/admin/types";
import { daysFromDateRange, formatScheduleDate } from "@/lib/schedule-days";

const RETREAT_TEMPLATE = {
  name: "Koinonia Retreat 2026",
  description:
    "Your private vault for Koinonia Retreat photos and speaker sessions. VIP guests also receive personal photo galleries.",
};

export function EventTab({
  data,
  eventNameEdit,
  setEventNameEdit,
  eventDescriptionEdit,
  setEventDescriptionEdit,
  eventStartsOn,
  setEventStartsOn,
  eventEndsOn,
  setEventEndsOn,
  scheduleLabels,
  setScheduleLabels,
  newEventName,
  setNewEventName,
  newEventDescription,
  setNewEventDescription,
  newEventDayCount,
  setNewEventDayCount,
  newEventDayLabels,
  setNewEventDayLabels,
  actions,
}: {
  data: AdminData;
  eventNameEdit: string;
  setEventNameEdit: (v: string) => void;
  eventDescriptionEdit: string;
  setEventDescriptionEdit: (v: string) => void;
  eventStartsOn: string;
  setEventStartsOn: (v: string) => void;
  eventEndsOn: string;
  setEventEndsOn: (v: string) => void;
  scheduleLabels: string[];
  setScheduleLabels: (v: string[] | ((prev: string[]) => string[])) => void;
  newEventName: string;
  setNewEventName: (v: string) => void;
  newEventDescription: string;
  setNewEventDescription: (v: string) => void;
  newEventDayCount: number;
  setNewEventDayCount: (v: number) => void;
  newEventDayLabels: string;
  setNewEventDayLabels: (v: string) => void;
  actions: AdminActions;
}) {
  const [savingEvent, setSavingEvent] = useState(false);
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const [sessionTitle, setSessionTitle] = useState("");
  const [sessionSpeaker, setSessionSpeaker] = useState("");
  const [sessionDayId, setSessionDayId] = useState(() => data.days[0]?._id || "");
  const [addingSession, setAddingSession] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSpeaker, setEditSpeaker] = useState("");
  const [editDayId, setEditDayId] = useState("");
  const [savingSession, setSavingSession] = useState(false);

  const rangeSchedule = useMemo(
    () => daysFromDateRange(eventStartsOn, eventEndsOn),
    [eventStartsOn, eventEndsOn],
  );

  function parseDayLabels(text: string, dayCount: number) {
    const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
    if (lines.length) return lines;
    return Array.from({ length: dayCount }, (_, index) => `Day ${index + 1}`);
  }

  async function syncScheduleFromRange(eventId: string) {
    const range = daysFromDateRange(eventStartsOn, eventEndsOn);
    if (!range.ok) {
      actions.setMessage(range.error);
      return false;
    }
    setScheduleLabels(range.days.map((day) => day.label));
    const json = await actions.postAction({
      action: "sync_days",
      eventId,
      days: range.days.map((day) => day.label),
      dates: range.days.map((day) => day.date),
    });
    return Boolean(json);
  }

  async function saveEventSettings(event?: FormEvent) {
    event?.preventDefault();
    if (!data.event) return;
    const name = eventNameEdit.trim();
    if (!name) {
      actions.setMessage("Enter an event name before saving.");
      return;
    }

    if (eventStartsOn.trim() || eventEndsOn.trim()) {
      const range = daysFromDateRange(eventStartsOn, eventEndsOn);
      if (!range.ok) {
        actions.setMessage(range.error);
        return;
      }
    }

    setSavingEvent(true);
    const json = await actions.postAction({
      action: "update_event",
      eventId: data.event._id,
      name,
      description: eventDescriptionEdit.trim(),
      startsOn: eventStartsOn.trim(),
      endsOn: eventEndsOn.trim(),
    });
    if (!json) {
      setSavingEvent(false);
      return;
    }

    if (eventStartsOn.trim() && eventEndsOn.trim()) {
      const synced = await syncScheduleFromRange(data.event._id);
      setSavingEvent(false);
      if (!synced) return;
      actions.setMessage("Event saved. Retreat schedule updated from the start and end dates.");
    } else {
      setSavingEvent(false);
      actions.setMessage("Event settings saved. Set start and end dates to build the retreat schedule.");
    }
    await actions.load(data.event._id);
  }

  async function applyRetreatTemplate() {
    if (!data.event) return;
    if (
      !confirm(
        `Apply the Koinonia template?\n\n• ${RETREAT_TEMPLATE.name}\n• Then set Starts on / Ends on so the Day 1… schedule matches your dates.`,
      )
    ) {
      return;
    }
    setApplyingTemplate(true);
    setEventNameEdit(RETREAT_TEMPLATE.name);
    setEventDescriptionEdit(RETREAT_TEMPLATE.description);
    await actions.postAction({
      action: "update_event",
      eventId: data.event._id,
      name: RETREAT_TEMPLATE.name,
      description: RETREAT_TEMPLATE.description,
      startsOn: eventStartsOn.trim(),
      endsOn: eventEndsOn.trim(),
    });
    if (eventStartsOn.trim() && eventEndsOn.trim()) {
      await syncScheduleFromRange(data.event._id);
    }
    setApplyingTemplate(false);
    actions.setMessage(
      eventStartsOn.trim() && eventEndsOn.trim()
        ? "Koinonia template applied. Schedule follows your dates."
        : "Koinonia template applied. Set Starts on and Ends on to build Day 1… days.",
    );
    await actions.load(data.event._id);
  }

  async function addSession(event: FormEvent) {
    event.preventDefault();
    if (!data.event) return;
    setAddingSession(true);
    const json = await actions.postAction({
      action: "add_session",
      eventId: data.event._id,
      dayId: sessionDayId,
      title: sessionTitle,
      speaker: sessionSpeaker,
    });
    setAddingSession(false);
    if (!json) return;
    setSessionTitle("");
    setSessionSpeaker("");
    actions.setMessage("Session added.");
    await actions.load(data.event._id);
  }

  async function createEvent(event: FormEvent) {
    event.preventDefault();
    if (!newEventName.trim()) return;
    const json = await actions.postAction({
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
    actions.setMessage(`Created event "${(json as { event: { name: string } }).event.name}".`);
    await actions.load((json as { event: { _id: string } }).event._id);
  }

  return (
    <>
      <AdminPanel
        title="Event"
        description="Name, dates, and schedule. Days are Day 1, Day 2… from Starts on through Ends on."
        action={
          <AdminButton onClick={applyRetreatTemplate} disabled={applyingTemplate || savingEvent} className="!h-9">
            {applyingTemplate ? "Applying…" : "Koinonia template"}
          </AdminButton>
        }
      >
        <div className="grid gap-5">
          <AdminField label="Event name">
            <input value={eventNameEdit} onChange={(e) => setEventNameEdit(e.target.value)} className={inputClassName} />
          </AdminField>
          <AdminField label="Guest-facing description">
            <textarea value={eventDescriptionEdit} onChange={(e) => setEventDescriptionEdit(e.target.value)} rows={3} className={textareaClassName} />
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

          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.08em] text-pine">Schedule</p>
            {!eventStartsOn.trim() || !eventEndsOn.trim() ? (
              <p className="text-sm text-pine">Set both dates, then save.</p>
            ) : !rangeSchedule.ok ? (
              <p className="text-sm text-red-700">{rangeSchedule.error}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {rangeSchedule.days.map((day) => (
                  <div
                    key={day.date}
                    className="min-w-[7.5rem] border border-[color:var(--line)] bg-white px-3 py-2.5"
                  >
                    <p className="text-sm font-medium text-ink">{day.label}</p>
                    <p className="mt-0.5 text-xs text-pine">{formatScheduleDate(day.date)}</p>
                  </div>
                ))}
              </div>
            )}
            {rangeSchedule.ok && scheduleLabels.length > 0 && scheduleLabels.length !== rangeSchedule.days.length ? (
              <p className="mt-3 text-sm text-pine">
                Saved schedule still has {scheduleLabels.length} days. Save changes to update it.
              </p>
            ) : null}
          </div>

          <AdminButton variant="primary" onClick={() => saveEventSettings()} disabled={savingEvent} className="w-full sm:w-auto">
            {savingEvent ? "Saving…" : "Save changes"}
          </AdminButton>
        </div>
      </AdminPanel>

      <HowTo title="How speaker sessions work" defaultOpen={!data.sessions.length}>
        <p>Create one session per talk (usually 2–3 per day), then paste each YouTube URL under Media.</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Choose Day 1, Day 2, …</li>
          <li>Add the talk title and speaker</li>
          <li>Link the video in Media → YouTube sessions</li>
        </ol>
      </HowTo>

      <AdminPanel title="Speaker sessions" description="One session per talk before linking YouTube videos.">
        <form onSubmit={addSession} className="grid gap-3 sm:grid-cols-2">
          <AdminField label="Day">
            <select value={sessionDayId} onChange={(e) => setSessionDayId(e.target.value)} className={inputClassName}>
              {data.days.map((day) => (
                <option key={day._id} value={day._id}>
                  {day.label}{day.date ? ` · ${formatScheduleDate(day.date)}` : ""}
                </option>
              ))}
            </select>
          </AdminField>
          <AdminField label="Session title">
            <input value={sessionTitle} onChange={(e) => setSessionTitle(e.target.value)} placeholder="Morning worship" required className={inputClassName} />
          </AdminField>
          <AdminField label="Speaker" className="sm:col-span-2">
            <input value={sessionSpeaker} onChange={(e) => setSessionSpeaker(e.target.value)} placeholder="Optional" className={inputClassName} />
          </AdminField>
          <AdminButton type="submit" variant="primary" disabled={addingSession} className="sm:col-span-2 sm:w-auto">
            {addingSession ? "Adding…" : "Add session"}
          </AdminButton>
        </form>
        {data.sessions.length ? (
          <ul className="mt-4 divide-y divide-[color:var(--line)]">
            {data.sessions.map((session) => {
              const day = data.days.find((d) => d._id === session.dayId);
              const isEditing = editingSessionId === session._id;

              if (isEditing) {
                return (
                  <li key={session._id} className="space-y-3 rounded-xl border border-ink/20 bg-mist/40 p-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <AdminField label="Day">
                        <select value={editDayId} onChange={(e) => setEditDayId(e.target.value)} className={inputClassName}>
                          {data.days.map((item) => (
                            <option key={item._id} value={item._id}>
                              {item.label}{item.date ? ` · ${formatScheduleDate(item.date)}` : ""}
                            </option>
                          ))}
                        </select>
                      </AdminField>
                      <AdminField label="Session title">
                        <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className={inputClassName} />
                      </AdminField>
                      <AdminField label="Speaker" className="sm:col-span-2">
                        <input value={editSpeaker} onChange={(e) => setEditSpeaker(e.target.value)} className={inputClassName} />
                      </AdminField>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <AdminButton
                        variant="primary"
                        className="!h-8 !px-3 !text-xs"
                        disabled={savingSession || !editTitle.trim()}
                        onClick={async () => {
                          setSavingSession(true);
                          const json = await actions.postAction({
                            action: "update_session",
                            sessionId: session._id,
                            dayId: editDayId,
                            title: editTitle.trim(),
                            speaker: editSpeaker.trim(),
                          });
                          setSavingSession(false);
                          if (!json) return;
                          setEditingSessionId(null);
                          actions.setMessage("Session updated.");
                          if (data.event) await actions.load(data.event._id);
                        }}
                      >
                        {savingSession ? "Saving…" : "Save"}
                      </AdminButton>
                      <AdminButton className="!h-8 !px-3 !text-xs" onClick={() => setEditingSessionId(null)}>
                        Cancel
                      </AdminButton>
                    </div>
                  </li>
                );
              }

              return (
                <li key={session._id} className="flex items-center justify-between gap-3 rounded-2xl px-1 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{session.title}</p>
                    <p className="mt-0.5 text-sm text-pine/65">
                      {day?.label}
                      {day?.date ? ` · ${formatScheduleDate(day.date)}` : ""}
                      {session.speaker ? ` · ${session.speaker}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <AdminButton
                      variant="ghost"
                      className="!h-8 !px-3 !text-xs"
                      onClick={() => {
                        setEditingSessionId(session._id);
                        setEditTitle(session.title);
                        setEditSpeaker(session.speaker || "");
                        setEditDayId(session.dayId);
                      }}
                    >
                      Edit
                    </AdminButton>
                    <AdminButton
                      variant="ghost"
                      className="!h-8 !px-3 !text-xs text-red-800 hover:bg-red-50"
                      onClick={async () => {
                        if (!confirm(`Delete session "${session.title}"? Associated media will also be removed.`)) return;
                        const json = await actions.postAction({ action: "delete_session", sessionId: session._id });
                        if (!json) return;
                        actions.setMessage("Session deleted.");
                        if (data.event) await actions.load(data.event._id);
                      }}
                    >
                      Delete
                    </AdminButton>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-pine/70">No sessions yet.</p>
        )}
      </AdminPanel>

      <details className="border-b border-[color:var(--line)] pb-6">
        <summary className="cursor-pointer text-sm text-pine">Add another event</summary>
        <form onSubmit={createEvent} className="mt-4 space-y-3">
          <input value={newEventName} onChange={(e) => setNewEventName(e.target.value)} placeholder="New event name" className={inputClassName} />
          <textarea value={newEventDescription} onChange={(e) => setNewEventDescription(e.target.value)} placeholder="Description (optional)" rows={2} className={textareaClassName} />
          <AdminButton type="submit">Add event</AdminButton>
        </form>
      </details>

      {data.events.length > 1 && data.event ? (
        <details className="pb-2">
          <summary className="cursor-pointer text-sm text-red-800">Delete this event</summary>
          <p className="mt-2 text-sm text-pine">
            Permanently deletes <strong>{data.event.name}</strong> and all days, sessions, guests, and media.
          </p>
          <AdminButton
            variant="danger"
            className="mt-3"
            onClick={async () => {
              if (!data.event) return;
              if (!confirm(`PERMANENTLY delete "${data.event.name}" and ALL its data? This cannot be undone.`)) return;
              const json = await actions.postAction({ action: "delete_event", eventId: data.event._id });
              if (!json) return;
              actions.setMessage(`Deleted event "${(json as { deleted: string }).deleted}".`);
              await actions.load();
            }}
          >
            Delete permanently
          </AdminButton>
        </details>
      ) : null}
    </>
  );
}
