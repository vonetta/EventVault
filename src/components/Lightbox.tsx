"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useDialog } from "@/lib/use-dialog";

type LightboxProps = {
  images: { src: string; alt: string }[];
  startIndex?: number;
  onClose: () => void;
};

function downloadUrl(src: string) {
  return `${src}${src.includes("?") ? "&" : "?"}download=1`;
}

export function Lightbox({ images, startIndex = 0, onClose }: LightboxProps) {
  const [index, setIndex] = useState(startIndex);
  const image = images[index];
  const dialogRef = useDialog(true, onClose);
  const titleId = useId();

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
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev]);

  if (!image) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/90 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[90vh] max-w-[90vw] flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="sr-only">
          {image.alt || "Photo"}
          {images.length > 1 ? ` — ${index + 1} of ${images.length}` : ""}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-foam transition hover:bg-white/30"
          aria-label="Close photo viewer"
        >
          ✕
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.src}
          alt={image.alt}
          className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain"
        />

        <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-foam">
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
              <span className="text-sm text-foam" aria-live="polite">
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
          <a
            href={downloadUrl(image.src)}
            className="rounded-full bg-white/15 px-4 py-2 text-sm transition hover:bg-white/25"
          >
            Download photo
          </a>
        </div>
      </div>
    </div>
  );
}
