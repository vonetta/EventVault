"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useDialog } from "@/lib/use-dialog";

export type LightboxImage = {
  id?: string;
  src: string;
  alt: string;
};

type LightboxProps = {
  images: LightboxImage[];
  startIndex?: number;
  onClose: () => void;
  allowDownload?: boolean;
  favoriteIds?: Set<string>;
  onToggleFavorite?: (id: string) => void;
  /** Auto-advance for Recap mode (ms). 0 = off. */
  autoplayMs?: number;
};

function downloadUrl(src: string) {
  return `${src}${src.includes("?") ? "&" : "?"}download=1`;
}

/**
 * Simple centered lightbox — dimmed backdrop, photo sized to the viewport,
 * always-visible controls. No full-bleed / fade-chrome tricks.
 */
export function Lightbox({
  images,
  startIndex = 0,
  onClose,
  allowDownload = true,
  favoriteIds,
  onToggleFavorite,
  autoplayMs = 0,
}: LightboxProps) {
  const [index, setIndex] = useState(startIndex);
  const image = images[index];
  const dialogRef = useDialog(true, onClose);
  const titleId = useId();

  useEffect(() => {
    setIndex(startIndex);
  }, [startIndex]);

  const next = useCallback(() => {
    setIndex((i) => (i + 1) % images.length);
  }, [images.length]);

  const prev = useCallback(() => {
    setIndex((i) => (i - 1 + images.length) % images.length);
  }, [images.length]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, onClose]);

  useEffect(() => {
    if (!autoplayMs || images.length < 2) return;
    const id = window.setInterval(() => next(), autoplayMs);
    return () => window.clearInterval(id);
  }, [autoplayMs, images.length, next]);

  if (!image) return null;

  const mediaId = image.id;
  const isFavorite = mediaId ? Boolean(favoriteIds?.has(mediaId)) : false;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/90 p-4 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[min(92dvh,920px)] w-full max-w-5xl flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="sr-only">
          {image.alt || "Photo"}
          {images.length > 1 ? ` — ${index + 1} of ${images.length}` : ""}
        </h2>

        <button
          type="button"
          onClick={onClose}
          className="absolute -right-1 -top-1 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-foam transition hover:bg-white/30 sm:-right-2 sm:-top-2"
          aria-label="Close photo viewer"
        >
          ✕
        </button>

        <div className="flex min-h-0 w-full flex-1 items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={image.src + String(index)}
            src={image.src}
            alt={image.alt}
            className="max-h-[min(78dvh,780px)] max-w-full rounded-lg object-contain shadow-lg"
            draggable={false}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-foam sm:gap-3">
          {images.length > 1 ? (
            <>
              <button
                type="button"
                onClick={prev}
                className="rounded-full bg-white/15 px-4 py-2 text-sm transition hover:bg-white/25"
                aria-label="Previous photo"
              >
                ← Prev
              </button>
              <span className="min-w-[4.5rem] text-center text-sm text-foam/90" aria-live="polite">
                {index + 1} / {images.length}
              </span>
              <button
                type="button"
                onClick={next}
                className="rounded-full bg-white/15 px-4 py-2 text-sm transition hover:bg-white/25"
                aria-label="Next photo"
              >
                Next →
              </button>
            </>
          ) : null}
          {mediaId && onToggleFavorite ? (
            <button
              type="button"
              onClick={() => onToggleFavorite(mediaId)}
              aria-pressed={isFavorite}
              className="rounded-full bg-white/15 px-4 py-2 text-sm transition hover:bg-white/25"
            >
              {isFavorite ? "♥ Saved" : "♡ Save"}
            </button>
          ) : null}
          {allowDownload ? (
            <a
              href={downloadUrl(image.src)}
              className="rounded-full bg-white/15 px-4 py-2 text-sm transition hover:bg-white/25"
            >
              Download
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
