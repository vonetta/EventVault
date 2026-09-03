"use client";

import { useState, type ReactNode } from "react";

export function HowTo({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-[color:var(--line)] pb-6">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <span className="text-sm text-pine">{title}</span>
        <span className="text-xs text-pine/60">{open ? "Hide" : "Show"}</span>
      </button>
      {open ? <div className="mt-3 space-y-2 text-sm leading-relaxed text-pine">{children}</div> : null}
    </div>
  );
}
