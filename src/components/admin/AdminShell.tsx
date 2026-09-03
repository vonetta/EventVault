"use client";

import type { ReactNode } from "react";

export type AdminTab = "overview" | "event" | "guests" | "media" | "email" | "audit";

const TABS: { id: AdminTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "event", label: "Event" },
  { id: "guests", label: "Guests" },
  { id: "media", label: "Media" },
  { id: "email", label: "Email" },
  { id: "audit", label: "Audit log" },
];

export function AdminShell({
  eventName,
  activeTab,
  onTabChange,
  message,
  onDismissMessage,
  onSignOut,
  children,
}: {
  eventName?: string;
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  message?: string;
  onDismissMessage?: () => void;
  onSignOut: () => void;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-[color:var(--line)] bg-foam/90 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 md:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-pine/60">
                EventVault Admin
              </p>
              <h1 className="font-[family-name:var(--font-fraunces)] text-2xl text-ink md:text-3xl">
                {eventName || "Dashboard"}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <a
                href="/"
                target="_blank"
                rel="noreferrer"
                className="hidden rounded-full border border-[color:var(--line)] bg-white/80 px-4 py-2 text-sm text-pine transition hover:bg-white sm:inline-flex"
              >
                Open guest site
              </a>
              <button
                type="button"
                onClick={onSignOut}
                className="rounded-full border border-[color:var(--line)] bg-white/80 px-4 py-2 text-sm text-pine transition hover:bg-white"
              >
                Sign out
              </button>
            </div>
          </div>

          <nav
            aria-label="Admin sections"
            className="-mx-1 flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none]"
          >
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${
                  activeTab === tab.id
                    ? "bg-ink text-foam shadow-sm"
                    : "text-pine hover:bg-white/80"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {message ? (
        <div className="mx-auto w-full max-w-6xl px-4 pt-4 md:px-8">
          <div className="flex items-start justify-between gap-3 rounded-2xl border border-gold/30 bg-gold/10 px-4 py-3 text-sm text-ink">
            <p>{message}</p>
            {onDismissMessage ? (
              <button
                type="button"
                onClick={onDismissMessage}
                className="shrink-0 text-pine/70 hover:text-ink"
                aria-label="Dismiss"
              >
                ✕
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">
        <div className="flex flex-col gap-6">{children}</div>
      </main>
    </div>
  );
}
