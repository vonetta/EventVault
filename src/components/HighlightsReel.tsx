"use client";

import { useEffect, useMemo, useState } from "react";
import { Lightbox } from "@/components/Lightbox";
import type { MediaItem } from "@/components/MediaGrid";

type HighlightsReelProps = {
  items: MediaItem[];
  /** Auto-advance interval in ms (0 disables). */
  intervalMs?: number;
};

/**
 * Cinematic Weekend Highlights strip — strongest shots, auto-advancing.
 * Opens the full lightbox on tap.
 */
export function HighlightsReel({ items, intervalMs = 4200 }: HighlightsReelProps) {
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const images = useMemo(
    () => items.filter((item) => item.contentType?.startsWith("image/")),
    [items],
  );

  useEffect(() => {
    setActive(0);
  }, [images]);

  useEffect(() => {
    if (images.length < 2 || intervalMs <= 0 || lightbox !== null) return;
    const id = window.setInterval(() => {
      setActive((i) => (i + 1) % images.length);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [images.length, intervalMs, lightbox]);

  if (!images.length) return null;

  const current = images[Math.min(active, images.length - 1)];

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-pine">
            Weekend highlights
          </p>
          <p className="mt-1 text-sm text-pine">
            {images.length} strongest moments — tap to open
          </p>
        </div>
        <span className="text-xs text-pine">
          {Math.min(active, images.length - 1) + 1} / {images.length}
        </span>
      </div>

      <button
        type="button"
        onClick={() => setLightbox(Math.min(active, images.length - 1))}
        className="group relative block w-full overflow-hidden rounded-2xl bg-mist text-left"
        aria-label={`Open highlight ${Math.min(active, images.length - 1) + 1} of ${images.length}`}
      >
        <div className="relative aspect-[16/10] w-full sm:aspect-[21/9]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={current.id}
            src={current.url}
            alt={current.title || "Highlight"}
            className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.02]"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/45 via-transparent to-transparent" />
        </div>
      </button>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {images.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setActive(index);
              setLightbox(index);
            }}
            aria-current={index === active ? "true" : undefined}
            className={`relative h-16 w-20 shrink-0 overflow-hidden rounded-lg transition ${
              index === active
                ? "ring-2 ring-ink ring-offset-2 ring-offset-[color:var(--bg,white)]"
                : "opacity-70 hover:opacity-100"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.url}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </button>
        ))}
      </div>

      {lightbox !== null ? (
        <Lightbox
          images={images.map((item) => ({
            src: item.url,
            alt: item.title || "Highlight",
          }))}
          startIndex={lightbox}
          onClose={() => setLightbox(null)}
          allowDownload
        />
      ) : null}
    </div>
  );
}
