"use client";

import type { AdminTab } from "@/components/admin/AdminShell";
import { SetupChecklist } from "@/components/admin/SetupChecklist";
import { AdminButton, AdminPanel, StatCard, StatusBadge } from "@/components/admin/ui";
import type { AdminActions, AdminData } from "@/components/admin/types";
import { inputClassName } from "@/components/admin/ui";
import { daysFromDateRange } from "@/lib/schedule-days";

const RETREAT_TEMPLATE = {
  name: "Koinonia Retreat 2026",
  description:
    "Your private vault for Koinonia Retreat photos and speaker sessions. VIP guests also receive personal photo galleries.",
};

export function OverviewTab({
  data,
  selectedEventId,
  eventDescriptionEdit,
  applyingTemplate,
  savingEvent,
  setActiveTab,
  setSelectedEventId,
  actions,
  eventStartsOn,
  eventEndsOn,
  setEventNameEdit,
  setEventDescriptionEdit,
  setScheduleLabels,
  onOpenWalkthrough,
}: {
  data: AdminData;
  selectedEventId: string;
  eventDescriptionEdit: string;
  applyingTemplate: boolean;
  savingEvent: boolean;
  setActiveTab: (tab: AdminTab) => void;
  setSelectedEventId: (id: string) => void;
  actions: AdminActions;
  eventStartsOn: string;
  eventEndsOn: string;
  setEventNameEdit: (v: string) => void;
  setEventDescriptionEdit: (v: string) => void;
  setScheduleLabels: (v: string[]) => void;
  onOpenWalkthrough: () => void;
}) {
  async function applyRetreatTemplate() {
    if (!data.event) return;
    if (
      !confirm(
        `Apply the Koinonia template?\n\n• ${RETREAT_TEMPLATE.name}\n• Schedule follows Starts on / Ends on (Day 1, Day 2…)`,
      )
    )
      return;

    setEventNameEdit(RETREAT_TEMPLATE.name);
    setEventDescriptionEdit(RETREAT_TEMPLATE.description);

    const eventJson = await actions.postAction({
      action: "update_event",
      eventId: data.event._id,
      name: RETREAT_TEMPLATE.name,
      description: RETREAT_TEMPLATE.description,
      startsOn: eventStartsOn.trim(),
      endsOn: eventEndsOn.trim(),
    });
    if (!eventJson) return;

    const range = daysFromDateRange(eventStartsOn, eventEndsOn);
    if (range.ok) {
      setScheduleLabels(range.days.map((day) => day.label));
      const daysJson = await actions.postAction({
        action: "sync_days",
        eventId: data.event._id,
        days: range.days.map((day) => day.label),
        dates: range.days.map((day) => day.date),
      });
      if (!daysJson) return;
      actions.setMessage("Koinonia template applied. Schedule follows your dates.");
    } else {
      actions.setMessage("Koinonia template applied. Set Starts on and Ends on in Event to build the Day 1… schedule.");
    }
    await actions.load(data.event._id);
  }

  return (
    <>
      <SetupChecklist
        data={data}
        onGoToTab={setActiveTab}
        onOpenWalkthrough={onOpenWalkthrough}
      />

      <div className="grid gap-6 border-b border-[color:var(--line)] pb-8 sm:grid-cols-4">
        <StatCard label="Guests" value={data.guests.length} />
        <StatCard label="Media" value={data.media.length} />
        <StatCard label="Sessions" value={data.sessions.length} />
        <StatCard label="Days" value={data.days.length} />
      </div>

      <AdminPanel
        title="Active event"
        description={data.days.map((day) => day.label).join(" · ") || "No days yet"}
        action={
          data.events.length > 1 ? (
            <select
              id="event-switch"
              value={selectedEventId}
              onChange={(e) => {
                setSelectedEventId(e.target.value);
                actions.load(e.target.value);
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
        <p className="text-sm text-pine">{eventDescriptionEdit || "No description yet."}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <AdminButton variant="primary" onClick={() => setActiveTab("event")}>
            Edit event
          </AdminButton>
          <AdminButton onClick={() => setActiveTab("guests")}>Guests</AdminButton>
          <AdminButton onClick={() => setActiveTab("media")}>Media</AdminButton>
          <AdminButton onClick={applyRetreatTemplate} disabled={applyingTemplate || savingEvent}>
            {applyingTemplate ? "Applying…" : "Koinonia template"}
          </AdminButton>
        </div>
      </AdminPanel>

      <AdminPanel title="Email">
        <div className="flex flex-wrap items-center gap-4">
          <StatusBadge tone={data.emailConfigured ? "success" : "warning"}>
            {data.emailConfigured ? "Gmail configured" : "Gmail not configured"}
          </StatusBadge>
          {!data.emailConfigured ? (
            <AdminButton onClick={() => setActiveTab("email")}>Set up</AdminButton>
          ) : null}
        </div>
      </AdminPanel>
    </>
  );
}
