"use client";

import { useEffect } from "react";
import { GuestTagPicker } from "@/components/GuestTagPicker";
import type { NameOnlyGuest } from "@/lib/guest-name-match";

type TagPhotoModalProps = {
  open: boolean;
  photoUrl: string;
  photoTitle: string;
  guests: NameOnlyGuest[];
  selectedIds: string[];
  disabled?: boolean;
  saveHint?: string;
  onClose: () => void;
  onChange: (ids: string[]) => void;
  onCreateGuest: (name: string) => Promise<NameOnlyGuest | null>;
  onRenameGuest?: (guestId: string, name: string) => Promise<NameOnlyGuest | null>;
};

/**
 * Tag people without scrolling away from the photo — large preview + picker
 * stay together in one overlay.
 */
export function TagPhotoModal({
  open,
  photoUrl,
  photoTitle,
  guests,
  selectedIds,
  disabled,
  saveHint,
  onClose,
  onChange,
  onCreateGuest,
  onRenameGuest,
}: TagPhotoModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Close tagging"
        className="absolute inset-0 bg-ink/50"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tag-photo-title"
        className="relative z-10 flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-[color:var(--line)] bg-white shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[color:var(--line)] px-4 py-3">
          <div className="min-w-0">
            <h2
              id="tag-photo-title"
              className="font-[family-name:var(--font-fraunces)] text-lg text-ink"
            >
              Tag people
            </h2>
            <p className="truncate text-xs text-pine">{photoTitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-foam"
          >
            Done
          </button>
        </div>

        <div className="grid min-h-0 flex-1 overflow-hidden sm:grid-cols-2">
          <div className="bg-mist/60 p-3 sm:border-r sm:border-[color:var(--line)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoUrl}
              alt={photoTitle}
              className="mx-auto max-h-[40vh] w-full rounded-lg object-contain sm:max-h-[70vh]"
            />
          </div>
          <div className="min-h-0 overflow-y-auto p-4">
            <p className="mb-3 text-xs text-pine">
              Tags save as you tap. Close when you’re finished — the photo stays in this
              gallery until you move it.
            </p>
            <GuestTagPicker
              guests={guests}
              selectedIds={selectedIds}
              disabled={disabled}
              onChange={onChange}
              onCreateGuest={onCreateGuest}
              onRenameGuest={onRenameGuest}
            />
            {saveHint ? (
              <p className="mt-3 text-xs font-medium text-ink" role="status">
                {saveHint}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
