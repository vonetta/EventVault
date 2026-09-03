"use client";

import { useState } from "react";
import type { AdminTab } from "@/components/admin/AdminShell";
import { AdminButton } from "@/components/admin/ui";
import { useDialog } from "@/lib/use-dialog";

const SLIDES: {
  title: string;
  body: string[];
  tab?: AdminTab;
  actionLabel?: string;
}[] = [
  {
    title: "What EventVault is",
    body: [
      "Guests open a private media vault with a ticket code. No passwords for guests.",
      "VIP guests see personal photos, speaker sessions, and the group gallery.",
      "Standard guests see the group gallery only.",
    ],
  },
  {
    title: "1. Event and days",
    body: [
      "Open the Event tab.",
      "Confirm the event name and the guest-facing description.",
      "Set Starts on and Ends on. The retreat schedule becomes Day 1, Day 2, Day 3… for those dates.",
      "Click Save changes so the schedule is applied.",
    ],
    tab: "event",
    actionLabel: "Go to Event",
  },
  {
    title: "2. Create speaker sessions first",
    body: [
      "Still on Event, scroll to Speaker sessions.",
      "Add one session for each talk — usually 2–3 per day.",
      "Choose the Day, type the talk title, then the speaker name.",
      "Example: Day 1 · Morning worship · Jane Doe.",
      "Do not paste YouTube links here. This step only creates the labels guests will see.",
    ],
    tab: "event",
    actionLabel: "Add sessions",
  },
  {
    title: "3. Paste YouTube URLs in Media",
    body: [
      "Open the Media tab and scroll to YouTube sessions.",
      "Session: pick the talk you just created.",
      "YouTube URL: paste that speaker’s single video link (youtu.be/…).",
      "Click Link YouTube. Repeat once per talk.",
      "Do not paste the whole playlist if you want videos separated by day and speaker.",
      "On YouTube, set each video to Unlisted.",
    ],
    tab: "media",
    actionLabel: "Paste URLs",
  },
  {
    title: "4. Import guests",
    body: [
      "Open the Guests tab.",
      "Paste one person per line: Name, email, vip or standard.",
      "Example: Jane Doe, jane@email.com, vip",
      "Click Import guests. Use View vault to preview what that person will see.",
    ],
    tab: "guests",
    actionLabel: "Import guests",
  },
  {
    title: "5. Upload photos",
    body: [
      "On Media, use Upload photos.",
      "Group gallery photo: everyone can see it.",
      "VIP personal photo: choose one VIP guest first, then upload.",
      "Large photos are resized automatically before upload.",
    ],
    tab: "media",
    actionLabel: "Upload photos",
  },
  {
    title: "6. Email ticket codes",
    body: [
      "Open Email and confirm Gmail is configured.",
      "If it is not, add GMAIL_USER and GMAIL_APP_PASSWORD in Vercel, then redeploy.",
      "Then import guests with Email ticket codes on import, or click Email next to one guest.",
      "Guests can also use Lost your ticket code? on the home page.",
    ],
    tab: "email",
    actionLabel: "Open Email",
  },
];

export function Walkthrough({
  open,
  onClose,
  onGoToTab,
}: {
  open: boolean;
  onClose: () => void;
  onGoToTab: (tab: AdminTab) => void;
}) {
  const [index, setIndex] = useState(0);
  const dialogRef = useDialog(open, onClose);
  if (!open) return null;

  const slide = SLIDES[index];
  const last = index === SLIDES.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="walkthrough-title"
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden border border-[color:var(--line)] bg-white"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[color:var(--line)] px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.1em] text-pine">
              Guide · {index + 1} of {SLIDES.length}
            </p>
            <h2 id="walkthrough-title" className="mt-1 font-[family-name:var(--font-fraunces)] text-2xl tracking-tight text-ink">
              {slide.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-2 text-pine hover:text-ink"
            aria-label="Close walkthrough"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-pine">
            {slide.body.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--line)] px-5 py-4">
          <AdminButton onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>
            Back
          </AdminButton>
          <div className="flex flex-wrap gap-2">
            {slide.tab ? (
              <AdminButton
                onClick={() => {
                  onGoToTab(slide.tab!);
                  onClose();
                }}
              >
                {slide.actionLabel}
              </AdminButton>
            ) : null}
            {last ? (
              <AdminButton variant="primary" onClick={onClose}>
                Done
              </AdminButton>
            ) : (
              <AdminButton variant="primary" onClick={() => setIndex((i) => i + 1)}>
                Next
              </AdminButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
