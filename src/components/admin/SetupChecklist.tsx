"use client";

import type { AdminTab } from "@/components/admin/AdminShell";
import { AdminButton, AdminPanel } from "@/components/admin/ui";
import type { AdminData } from "@/components/admin/types";
import { getSetupProgress } from "@/lib/setup-progress";

export function SetupChecklist({
  data,
  onGoToTab,
  onOpenWalkthrough,
}: {
  data: AdminData;
  onGoToTab: (tab: AdminTab) => void;
  onOpenWalkthrough: () => void;
}) {
  const progress = getSetupProgress(data);
  const percent = Math.round((progress.completed / progress.total) * 100);

  return (
    <AdminPanel
      title="Setup unlock"
      description="Complete these steps so guests can open their vault. Anyone on the admin team can follow this list."
      action={
        <AdminButton onClick={onOpenWalkthrough}>
          Start walkthrough
        </AdminButton>
      }
    >
      <div className="mb-4">
        <div className="flex items-center justify-between text-sm text-pine">
          <span>
            {progress.allRequiredDone
              ? "Required setup is complete"
              : `${progress.completed} of ${progress.total} required steps unlocked`}
          </span>
          <span className="font-medium text-ink">{percent}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-mist">
          <div
            className="h-full rounded-full bg-ink transition-all"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <ol className="space-y-2">
        {progress.steps.map((step, index) => (
          <li
            key={step.id}
            className={`flex flex-wrap items-start justify-between gap-3 rounded-xl border px-3 py-3 ${
              step.done
                ? "border-emerald-200 bg-emerald-50/70"
                : progress.next?.id === step.id
                  ? "border-gold/40 bg-gold/10"
                  : "border-[color:var(--line)] bg-white/70"
            }`}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">
                <span className="mr-2 text-pine/50">{index + 1}.</span>
                {step.done ? "Unlocked · " : ""}
                {step.title}
              </p>
              <p className="mt-1 text-sm text-pine/75">{step.detail}</p>
            </div>
            {step.done ? (
              <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-900">
                Done
              </span>
            ) : (
              <AdminButton
                variant={progress.next?.id === step.id ? "primary" : "secondary"}
                className="!h-9 shrink-0"
                onClick={() => onGoToTab(step.tab)}
              >
                {step.actionLabel}
              </AdminButton>
            )}
          </li>
        ))}
      </ol>
    </AdminPanel>
  );
}
