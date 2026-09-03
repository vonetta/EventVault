import type { AdminData } from "@/components/admin/types";
import type { AdminTab } from "@/components/admin/AdminShell";

export type SetupStepId =
  | "days"
  | "sessions"
  | "youtube"
  | "guests"
  | "photos"
  | "email";

export type SetupStep = {
  id: SetupStepId;
  title: string;
  detail: string;
  done: boolean;
  tab: AdminTab;
  actionLabel: string;
};

export function getSetupProgress(data: AdminData) {
  const youtubeLinked = data.media.some(
    (item) =>
      item.kind === "session_video" &&
      (item.storageProvider === "youtube" || item.youtubeId || item.youtubePlaylistId),
  );
  const photosUploaded = data.media.some(
    (item) => item.kind === "group_photo" || item.kind === "event_photo" || item.kind === "personal_photo",
  );
  const sessionsWithoutVideo = data.sessions.filter(
    (session) =>
      !data.media.some(
        (item) =>
          item.sessionId === session._id &&
          (item.storageProvider === "youtube" || item.youtubeId || item.youtubePlaylistId),
      ),
  ).length;

  const steps: SetupStep[] = [
    {
      id: "days",
      title: "Set the retreat days",
      detail: "Set Starts on and Ends on. The schedule becomes Day 1, Day 2, Day 3… for that range.",
      done: data.days.length > 0,
      tab: "event",
      actionLabel: "Open Event",
    },
    {
      id: "sessions",
      title: "Add speaker sessions",
      detail: "Create one session per talk (2–3 per day). Do this before pasting YouTube links.",
      done: data.sessions.length > 0,
      tab: "event",
      actionLabel: "Add sessions",
    },
    {
      id: "youtube",
      title: "Link YouTube videos",
      detail:
        sessionsWithoutVideo > 0
          ? `${sessionsWithoutVideo} session${sessionsWithoutVideo === 1 ? "" : "s"} still need a video. Paste each talk’s URL in Media → YouTube sessions.`
          : "Paste one video URL per session in Media → YouTube sessions.",
      done: youtubeLinked && sessionsWithoutVideo === 0,
      tab: "media",
      actionLabel: "Paste URLs",
    },
    {
      id: "guests",
      title: "Import guests",
      detail: "One line per person: Name, email, vip or standard.",
      done: data.guests.length > 0,
      tab: "guests",
      actionLabel: "Import guests",
    },
    {
      id: "photos",
      title: "Upload photos",
      detail: "Event gallery for everyone. Group photos if you want them separate. VIP personal photos go to one guest.",
      done: photosUploaded,
      tab: "media",
      actionLabel: "Upload photos",
    },
    {
      id: "email",
      title: "Set up ticket email",
      detail: "Optional. Needed to send or resend ticket codes automatically.",
      done: Boolean(data.emailConfigured),
      tab: "email",
      actionLabel: "Set up email",
    },
  ];

  const required = steps.filter((step) => step.id !== "email");
  const completed = required.filter((step) => step.done).length;
  const next = steps.find((step) => !step.done) || null;

  return {
    steps,
    completed,
    total: required.length,
    next,
    allRequiredDone: completed === required.length,
  };
}
