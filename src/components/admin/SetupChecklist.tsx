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

  return (
    <AdminPanel
      title="Setup"
      description="Work through these in order."
      action={
        <AdminButton onClick={onOpenWalkthrough} className="!h-9">
          Guide
        </AdminButton>
      }
    >
      <ol className="space-y-0">
        {progress.steps.map((step, index) => {
          const isNext = !step.done && progress.next?.id === step.id;
          return (
            <li
              key={step.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--line)] py-3 last:border-b-0"
            >
              <div className="min-w-0">
                <p className={`text-sm ${step.done ? "text-pine" : "text-ink"}`}>
                  <span className="mr-2 text-pine/50">{index + 1}.</span>
                  {step.title}
                  {step.done ? <span className="ml-2 text-xs text-pine">Done</span> : null}
                </p>
                {!step.done && isNext ? (
                  <p className="mt-1 pl-5 text-sm text-pine">{step.detail}</p>
                ) : null}
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
