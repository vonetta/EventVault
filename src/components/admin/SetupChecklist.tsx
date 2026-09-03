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
      title="Setup"
      description="Work through these in order. Anyone on the admin team can pick up where you left off."
      action={
        <AdminButton onClick={onOpenWalkthrough} className="!h-9">
          Walkthrough
        </AdminButton>
      }
    >
      <div className="mb-5">
        <div className="flex items-center justify-between text-sm text-pine/70">
          <span>
            {progress.allRequiredDone
              ? "Required setup is complete"
              : `${progress.completed} of ${progress.total} complete`}
          </span>
          <span className="tabular-nums text-ink">{percent}%</span>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-mist">
          <div className="h-full rounded-full bg-pine transition-all" style={{ width: `${percent}%` }} />
        </div>
      </div>

      <ol className="space-y-1">
        {progress.steps.map((step, index) => {
          const isNext = !step.done && progress.next?.id === step.id;
          return (
            <li
              key={step.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl px-2 py-2.5"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
                    step.done
                      ? "bg-pine text-foam"
                      : isNext
                        ? "bg-ink text-foam"
                        : "bg-mist text-pine/60"
                  }`}
                >
                  {step.done ? "✓" : index + 1}
                </span>
                <div className="min-w-0">
                  <p className={`text-sm ${step.done ? "text-pine/60" : "font-medium text-ink"}`}>
                    {step.title}
                  </p>
                  {!step.done ? <p className="mt-0.5 text-sm text-pine/65">{step.detail}</p> : null}
                </div>
              </div>
              {!step.done ? (
                <AdminButton
                  variant={isNext ? "primary" : "ghost"}
                  className="!h-8 shrink-0 !px-3 !text-xs"
                  onClick={() => onGoToTab(step.tab)}
                >
                  {step.actionLabel}
                </AdminButton>
              ) : null}
            </li>
          );
        })}
      </ol>
    </AdminPanel>
  );
}
