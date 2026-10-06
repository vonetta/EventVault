"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
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
  /** Favorite media ids (heart toggle). */
  favoriteIds?: Set<string>;
  onToggleFavorite?: (id: string) => void;
  /** Auto-advance for Recap mode (ms). 0 = off. */
  autoplayMs?: number;
};

function downloadUrl(src: string) {
  return `${src}${src.includes("?") ? "&" : "?"}download=1`;
}

/**
 * Full-bleed cinematic viewer — swipe, keyboard, fading chrome.
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
  const [chromeVisible, setChromeVisible] = useState(true);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const image = images[index];
  const dialogRef = useDialog(true, onClose);
  const titleId = useId();
  const touchStartX = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    setIndex(startIndex);
  }, [startIndex]);

  useEffect(() => {
    setLoadState("loading");
    // Cached images may not fire onLoad — check complete after paint.
    const id = window.requestAnimationFrame(() => {
      const el = imgRef.current;
      if (el?.complete && el.naturalWidth > 0) setLoadState("ready");
      else if (el?.complete) setLoadState("error");
    });
    return () => window.cancelAnimationFrame(id);
  }, [image?.src, index]);

  const next = useCallback(() => {
    setIndex((i) => (i + 1) % images.length);
  }, [images.length]);

  const prev = useCallback(() => {
    setIndex((i) => (i - 1 + images.length) % images.length);
  }, [images.length]);

  const bumpChrome = useCallback(() => {
    setChromeVisible(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setChromeVisible(false), 2600);
  }, []);

  useEffect(() => {
    bumpChrome();
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, [index, bumpChrome]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "Escape") onClose();
      bumpChrome();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, onClose, bumpChrome]);

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
      className="fixed inset-0 z-50 bg-ink"
      onClick={onClose}
      onMouseMove={bumpChrome}
      onTouchStart={(e) => {
        touchStartX.current = e.changedTouches[0]?.clientX ?? null;
        bumpChrome();
      }}
      onTouchEnd={(e) => {
        const start = touchStartX.current;
        touchStartX.current = null;
        if (start == null) return;
        const end = e.changedTouches[0]?.clientX ?? start;
        const delta = end - start;
        if (Math.abs(delta) < 48) return;
        if (delta < 0) next();
        else prev();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex h-[100dvh] w-[100vw] items-center justify-center overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="sr-only">
          {image.alt || "Photo"}
          {images.length > 1 ? ` — ${index + 1} of ${images.length}` : ""}
        </h2>

        {loadState === "loading" ? (
          <p className="pointer-events-none absolute text-sm text-foam/70" aria-live="polite">
            Loading photo…
          </p>
        ) : null}
        {loadState === "error" ? (
          <p className="pointer-events-none absolute text-sm text-foam/80" role="alert">
            Couldn’t load this photo.
          </p>
        ) : null}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          key={image.src + String(index)}
          src={image.src}
          alt={image.alt}
          // Viewport units — max-h-full inside flex collapses to 0 (black screen).
          className={`h-auto w-auto max-h-[100dvh] max-w-[100vw] object-contain transition-opacity duration-300 ${
            loadState === "ready" ? "opacity-100" : "opacity-0"
          }`}
          draggable={false}
          onLoad={() => setLoadState("ready")}
          onError={() => setLoadState("error")}
        />

        <div
          className={`pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-ink/70 to-transparent px-4 pb-16 pt-4 transition-opacity duration-300 ${
            chromeVisible ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="pointer-events-auto flex items-center justify-between gap-3 text-foam">
            <p className="truncate text-sm text-foam/90">
              {image.alt || "Photo"}
              {images.length > 1 ? (
                <span className="ml-2 text-foam/60">
                  {index + 1} / {images.length}
                </span>
              ) : null}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-lg transition hover:bg-white/25"
              aria-label="Close photo viewer"
            >
              ✕
            </button>
          </div>
        </div>

        <div
          className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-ink/80 to-transparent px-4 pb-6 pt-16 transition-opacity duration-300 ${
            chromeVisible ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="pointer-events-auto mx-auto flex max-w-lg flex-wrap items-center justify-center gap-2 text-foam">
            {images.length > 1 ? (
              <>
                <button
                  type="button"
                  onClick={prev}
                  className="rounded-full bg-white/15 px-4 py-2 text-sm transition hover:bg-white/25"
                  aria-label="Previous photo"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={next}
                  className="rounded-full bg-white/15 px-4 py-2 text-sm transition hover:bg-white/25"
                  aria-label="Next photo"
                >
                  →
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
    </div>
  );
}
