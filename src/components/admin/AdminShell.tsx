"use client";

import type { ReactNode } from "react";

export type AdminTab = "overview" | "event" | "guests" | "media" | "email" | "audit";

const TABS: { id: AdminTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "event", label: "Event" },
  { id: "guests", label: "Guests" },
  { id: "media", label: "Media" },
  { id: "email", label: "Email" },
  { id: "audit", label: "Activity" },
];

export function AdminShell({
  eventName,
  activeTab,
  onTabChange,
  message,
  onDismissMessage,
  onSignOut,
  onOpenGuide,
  children,
}: {
  eventName?: string;
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  message?: string;
  onDismissMessage?: () => void;
  onSignOut: () => void;
  onOpenGuide?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-mist">
      <header className="sticky top-0 z-20 border-b border-[color:var(--line)] bg-mist/95 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-5 py-5 md:px-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-pine">Admin</p>
              <h1 className="mt-1 font-[family-name:var(--font-fraunces)] text-3xl tracking-tight text-ink">
                {eventName || "Dashboard"}
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {onOpenGuide ? (
                <button
                  type="button"
                  onClick={onOpenGuide}
                  className="rounded-lg px-3 py-2 text-sm text-pine transition hover:bg-white hover:text-ink"
                >
                  Guide
                </button>
              ) : null}
              <a
                href="/"
                target="_blank"
                rel="noreferrer"
                className="rounded-lg px-3 py-2 text-sm text-pine transition hover:bg-white hover:text-ink"
              >
                Guest site <span className="sr-only">(opens in a new tab)</span>
              </a>
              <button
                type="button"
                onClick={onSignOut}
                className="rounded-lg px-3 py-2 text-sm text-pine transition hover:bg-white hover:text-ink"
              >
                Sign out
              </button>
            </div>
          </div>

          <nav aria-label="Admin sections" className="-mx-1 flex gap-0 overflow-x-auto border-b border-[color:var(--line)] [scrollbar-width:none]">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                aria-current={activeTab === tab.id ? "page" : undefined}
                className={`shrink-0 border-b-2 px-3 py-2.5 text-sm transition ${
                  activeTab === tab.id
                    ? "border-ink font-medium text-ink"
                    : "border-transparent text-pine hover:text-ink"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {message ? (
        <div className="mx-auto w-full max-w-5xl px-5 pt-5 md:px-8">
          <div
            role="status"
            className="flex items-start justify-between gap-3 border border-[color:var(--line)] bg-white px-4 py-3 text-sm text-ink"
          >
            <p>{message}</p>
            {onDismissMessage ? (
              <button
                type="button"
                onClick={onDismissMessage}
                className="shrink-0 text-pine hover:text-ink"
                aria-label="Dismiss message"
              >
                ✕
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-5xl px-5 py-8 md:px-8">
        <div className="flex flex-col gap-10">{children}</div>
      </main>
    </div>
  );
}
