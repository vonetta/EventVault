"use client";

import { FormEvent, useState } from "react";
import { HowTo } from "@/components/admin/HowTo";
import { AdminButton, AdminField, AdminPanel, inputClassName, textareaClassName } from "@/components/admin/ui";
import type { AdminActions, AdminData } from "@/components/admin/types";

const RETREAT_TEMPLATE = {
  name: "Koinonia Retreat 2026",
  description:
    "Your private vault for Koinonia Retreat photos and speaker sessions. VIP guests also receive personal photo galleries.",
  dayLabels: ["Thursday", "Friday", "Saturday", "Sunday", "Monday"],
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
  const [savingSchedule, setSavingSchedule] = useState(false);
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

  function parseDayLabels(text: string, dayCount: number) {
    const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
    if (lines.length) return lines;
    return Array.from({ length: dayCount }, (_, index) => `Day ${index + 1}`);
  }

  async function saveEventSettings(event?: FormEvent) {
    event?.preventDefault();
    if (!data.event) return;
    const name = eventNameEdit.trim();
    if (!name) {
      actions.setMessage("Enter an event name before saving.");
      return;
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
    setSavingEvent(false);
    if (!json) return;
    actions.setMessage("Event settings saved.");
    await actions.load(data.event._id);
  }

  async function applyRetreatTemplate() {
    if (!data.event) return;
    if (!confirm(`Apply the Koinonia template?\n\n• ${RETREAT_TEMPLATE.name}\n• ${RETREAT_TEMPLATE.dayLabels.length} days: ${RETREAT_TEMPLATE.dayLabels.join(", ")}`)) return;
    setApplyingTemplate(true);
    setEventNameEdit(RETREAT_TEMPLATE.name);
    setEventDescriptionEdit(RETREAT_TEMPLATE.description);
    setScheduleLabels([...RETREAT_TEMPLATE.dayLabels]);
    await actions.postAction({ action: "update_event", eventId: data.event._id, name: RETREAT_TEMPLATE.name, description: RETREAT_TEMPLATE.description, startsOn: eventStartsOn.trim(), endsOn: eventEndsOn.trim() });
    await actions.postAction({ action: "sync_days", eventId: data.event._id, days: RETREAT_TEMPLATE.dayLabels });
    setApplyingTemplate(false);
    actions.setMessage("Koinonia template applied.");
    await actions.load(data.event._id);
  }

  function addScheduleDay() {
    if (scheduleLabels.length >= 14) {
      actions.setMessage("Maximum 14 days per event.");
      return;
    }
    setScheduleLabels((prev) => [...prev, `Day ${prev.length + 1}`]);
  }

  function removeScheduleDay(index: number) {
    if (scheduleLabels.length <= 1) {
      actions.setMessage("Keep at least one day.");
      return;
    }
    setScheduleLabels((prev) => prev.filter((_, i) => i !== index));
  }

  function moveScheduleDay(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= scheduleLabels.length) return;
    setScheduleLabels((prev) => {
      const copy = [...prev];
      [copy[index], copy[nextIndex]] = [copy[nextIndex], copy[index]];
      return copy;
    });
  }

  async function saveDaySchedule() {
    if (!data.event) return;
    const labels = scheduleLabels.map((l) => l.trim()).filter(Boolean);
    if (!labels.length || labels.length !== scheduleLabels.length) {
      actions.setMessage("Each day needs a name.");
      return;
    }
    setSavingSchedule(true);
    const json = await actions.postAction({ action: "sync_days", eventId: data.event._id, days: labels });
    setSavingSchedule(false);
    if (!json) return;
    actions.setMessage("Day schedule saved.");
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
        title="Event details"
        description="Name and description guests see when they open their vault."
        action={
          <AdminButton onClick={applyRetreatTemplate} disabled={applyingTemplate || savingEvent}>
            {applyingTemplate ? "Applying…" : "Koinonia template"}
          </AdminButton>
        }
      >
        <div className="grid gap-4">
          <AdminField label="Event name">
            <input value={eventNameEdit} onChange={(e) => setEventNameEdit(e.target.value)} className={inputClassName} />
          </AdminField>
          <AdminField label="Guest-facing description">
            <textarea value={eventDescriptionEdit} onChange={(e) => setEventDescriptionEdit(e.target.value)} rows={3} className={textareaClassName} />
          </AdminField>
          <div className="grid gap-4 sm:grid-cols-2">
            <AdminField label="Starts on">
              <input type="date" value={eventStartsOn} onChange={(e) => setEventStartsOn(e.target.value)} className={inputClassName} />
            </AdminField>
            <AdminField label="Ends on">
              <input type="date" value={eventEndsOn} onChange={(e) => setEventEndsOn(e.target.value)} className={inputClassName} />
            </AdminField>
          </div>
          <AdminButton variant="primary" onClick={() => saveEventSettings()} disabled={savingEvent} className="w-full sm:w-auto">
            {savingEvent ? "Saving…" : "Save changes"}
          </AdminButton>
        </div>
      </AdminPanel>

      <AdminPanel
        title="Retreat schedule"
        description="Add, rename, reorder, or remove days — then save once."
        action={
          <div className="flex flex-wrap gap-2">
            <AdminButton onClick={() => setScheduleLabels([...RETREAT_TEMPLATE.dayLabels])}>Koinonia preset</AdminButton>
            <AdminButton onClick={addScheduleDay}>Add day</AdminButton>
          </div>
        }
      >
        <ul className="space-y-2">
          {scheduleLabels.map((label, index) => (
            <li key={`${index}-${label}`} className="flex flex-wrap items-center gap-2 rounded-xl border border-[color:var(--line)] bg-mist/30 p-2">
              <span className="w-6 shrink-0 text-center text-xs font-medium text-pine/60">{index + 1}</span>
              <input
                value={label}
                onChange={(e) => setScheduleLabels((prev) => prev.map((item, i) => (i === index ? e.target.value : item)))}
                placeholder={`Day ${index + 1}`}
                className={`${inputClassName} min-w-[10rem] flex-1`}
              />
              <div className="flex gap-1">
                <AdminButton className="!h-9 !w-9 !px-0" onClick={() => moveScheduleDay(index, -1)} disabled={index === 0} aria-label="Move up">↑</AdminButton>
                <AdminButton className="!h-9 !w-9 !px-0" onClick={() => moveScheduleDay(index, 1)} disabled={index === scheduleLabels.length - 1} aria-label="Move down">↓</AdminButton>
                <AdminButton variant="danger" className="!h-9 !px-3" onClick={() => removeScheduleDay(index)} disabled={scheduleLabels.length <= 1}>Remove</AdminButton>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <AdminButton variant="primary" onClick={saveDaySchedule} disabled={savingSchedule}>
            {savingSchedule ? "Saving schedule…" : "Save schedule"}
          </AdminButton>
        </div>
      </AdminPanel>

      <HowTo title="How speaker sessions work" defaultOpen={!data.sessions.length}>
        <p>Create <strong>one session per talk</strong>, usually 2–3 per day. This is only the label guests will see.</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Choose the <strong>Day</strong> (Day 1, Day 2, …).</li>
          <li>Type the talk title, then the speaker name.</li>
          <li>Click <strong>Add session</strong>. Repeat for every talk.</li>
          <li>Next, go to <strong>Media → YouTube sessions</strong> and paste each video URL.</li>
        </ol>
        <p>Do not paste YouTube links on this page.</p>
      </HowTo>

      <AdminPanel title="Speaker sessions" description="Create one session per talk before linking YouTube videos in Media.">
        <form onSubmit={addSession} className="grid gap-3 sm:grid-cols-2">
          <AdminField label="Day">
            <select value={sessionDayId} onChange={(e) => setSessionDayId(e.target.value)} className={inputClassName}>
              {data.days.map((day) => (
                <option key={day._id} value={day._id}>{day.label}</option>
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
          <ul className="mt-4 space-y-2">
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
                            <option key={item._id} value={item._id}>{item.label}</option>
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
                <li key={session._id} className="flex items-center justify-between gap-2 rounded-xl border border-[color:var(--line)] bg-white px-3 py-2 text-sm text-pine">
                  <div>
                    <span className="font-medium text-ink">{session.title}</span>
                    <span className="text-pine/70"> · {day?.label}{session.speaker ? ` · ${session.speaker}` : ""}</span>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <AdminButton
                      className="!h-7 !px-2 !text-xs"
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
                      variant="danger"
                      className="!h-7 !px-2 !text-xs"
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

      <details className="rounded-2xl border border-[color:var(--line)] bg-white/60 p-4">
        <summary className="cursor-pointer text-sm font-medium text-pine">Add another event (advanced)</summary>
        <form onSubmit={createEvent} className="mt-4 space-y-3">
          <input value={newEventName} onChange={(e) => setNewEventName(e.target.value)} placeholder="New event name" className={inputClassName} />
          <textarea value={newEventDescription} onChange={(e) => setNewEventDescription(e.target.value)} placeholder="Description (optional)" rows={2} className={textareaClassName} />
          <AdminButton type="submit">Add event</AdminButton>
        </form>
      </details>

      {data.events.length > 1 && data.event ? (
        <details className="rounded-2xl border border-red-200 bg-red-50/50 p-4">
          <summary className="cursor-pointer text-sm font-medium text-red-800">Delete this event</summary>
          <p className="mt-2 text-sm text-red-700">
            This will permanently delete <strong>{data.event.name}</strong> and all its days, sessions, guests, and media.
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
            Delete event permanently
          </AdminButton>
        </details>
      ) : null}
    </>
  );
}
