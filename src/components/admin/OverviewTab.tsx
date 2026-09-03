"use client";

import type { AdminTab } from "@/components/admin/AdminShell";
import { AdminButton, AdminPanel, StatCard, StatusBadge } from "@/components/admin/ui";
import type { AdminActions, AdminData } from "@/components/admin/types";
import { inputClassName } from "@/components/admin/ui";

const RETREAT_TEMPLATE = {
  name: "Koinonia Retreat 2026",
  description:
    "Your private vault for Koinonia Retreat photos and speaker sessions. VIP guests also receive personal photo galleries.",
  dayLabels: ["Thursday", "Friday", "Saturday", "Sunday", "Monday"],
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
}) {
  async function applyRetreatTemplate() {
    if (!data.event) return;
    if (
      !confirm(
        `Apply the Koinonia template?\n\n• ${RETREAT_TEMPLATE.name}\n• ${RETREAT_TEMPLATE.dayLabels.length} days: ${RETREAT_TEMPLATE.dayLabels.join(", ")}`,
      )
    )
      return;

    setEventNameEdit(RETREAT_TEMPLATE.name);
    setEventDescriptionEdit(RETREAT_TEMPLATE.description);
    setScheduleLabels([...RETREAT_TEMPLATE.dayLabels]);

    const eventJson = await actions.postAction({
      action: "update_event",
      eventId: data.event._id,
      name: RETREAT_TEMPLATE.name,
      description: RETREAT_TEMPLATE.description,
      startsOn: eventStartsOn.trim(),
      endsOn: eventEndsOn.trim(),
    });
    if (!eventJson) return;

    const daysJson = await actions.postAction({
      action: "sync_days",
      eventId: data.event._id,
      days: RETREAT_TEMPLATE.dayLabels,
    });
    if (!daysJson) return;

    actions.setMessage("Koinonia template applied. Adjust dates in Event settings if needed.");
    await actions.load(data.event._id);
  }

  return (
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
        <p className="text-sm text-pine/80">{eventDescriptionEdit || "No description yet."}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <AdminButton variant="primary" onClick={() => setActiveTab("event")}>
            Edit event
          </AdminButton>
          <AdminButton onClick={() => setActiveTab("guests")}>Manage guests</AdminButton>
          <AdminButton onClick={() => setActiveTab("media")}>Upload media</AdminButton>
          <AdminButton onClick={applyRetreatTemplate} disabled={applyingTemplate || savingEvent}>
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
}
