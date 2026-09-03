"use client";

import { useEffect, useRef, useState } from "react";
import { Lightbox } from "@/components/Lightbox";

export type MediaItem = {
  id: string;
  title: string;
  contentType: string;
  url: string;
  provider?: "file" | "youtube";
  embedUrl?: string;
  availableUntil?: string | null;
};

type MediaGridProps = {
  items: MediaItem[];
  emptyMessage?: string;
  onRemove?: (id: string) => void;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
};

function LazyImage({ src, alt, className }: { src: string; alt: string; className: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={className}>
      {visible ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="h-full w-full object-cover" src={src} alt={alt} loading="lazy" decoding="async" />
      ) : (
        <div className="h-full w-full animate-pulse bg-mist" aria-hidden />
      )}
    </div>
  );
}

export function MediaGrid({
  items,
  emptyMessage = "Nothing here yet.",
  onRemove,
  selectable,
  selectedIds,
  onToggleSelect,
}: MediaGridProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (!items.length) {
    return <p className="text-sm text-pine/70">{emptyMessage}</p>;
  }

  const imageItems = items
    .map((item, idx) => ({ item, idx }))
    .filter(
      ({ item }) =>
        item.contentType.startsWith("image/") &&
        item.provider !== "youtube",
    );

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, idx) => {
          const isYouTube =
            item.provider === "youtube" ||
            item.contentType === "video/youtube" ||
            item.contentType === "video/youtube-playlist";

          if (isYouTube && item.embedUrl) {
            const isSelected = selectable && selectedIds?.has(item.id);
            return (
              <div
                key={item.id}
                className={`relative overflow-hidden rounded-2xl border bg-white/70 ${isSelected ? "border-ink ring-2 ring-ink/20" : "border-[color:var(--line)]"}`}
              >
                {selectable && onToggleSelect ? (
                  <label className="absolute left-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-md bg-white/90 shadow">
                    <input type="checkbox" checked={!!isSelected} onChange={() => onToggleSelect(item.id)} className="h-4 w-4" />
                  </label>
                ) : null}
                <div className="aspect-video w-full bg-ink/90">
                  <iframe
                    className="h-full w-full"
                    src={item.embedUrl}
                    title={item.title}
                    loading="lazy"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
                <div className="px-3 py-2 text-sm text-pine">
                  {item.title}
                  {item.availableUntil ? (
                    <span className="mt-1 block text-xs text-pine/60">
                      Available until {new Date(item.availableUntil).toLocaleDateString()}
                    </span>
                  ) : null}
                </div>
                {onRemove ? (
                  <button
                    type="button"
                    onClick={() => onRemove(item.id)}
                    className="absolute right-2 top-2 rounded-full bg-ink/80 px-2 py-1 text-xs text-foam"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            );
          }

          const isImage =
            item.contentType.startsWith("image/") && item.provider !== "youtube";
          const lightboxPosition = isImage
            ? imageItems.findIndex((entry) => entry.idx === idx)
            : -1;
          const isSelected = selectable && selectedIds?.has(item.id);

          return (
            <div
              key={item.id}
              className={`relative overflow-hidden rounded-2xl border bg-white/70 transition hover:-translate-y-0.5 hover:shadow-md ${isSelected ? "border-ink ring-2 ring-ink/20" : "border-[color:var(--line)]"}`}
            >
              {selectable && onToggleSelect ? (
                <label className="absolute left-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-md bg-white/90 shadow">
                  <input type="checkbox" checked={!!isSelected} onChange={() => onToggleSelect(item.id)} className="h-4 w-4" />
                </label>
              ) : null}
              {isImage ? (
                <button
                  type="button"
                  className="block w-full text-left"
                  onClick={() => {
                    if (lightboxPosition >= 0) setLightboxIndex(lightboxPosition);
                  }}
                >
                  <LazyImage
                    src={item.url}
                    alt={item.title}
                    className="aspect-[4/3] w-full"
                  />
                  <div className="px-3 py-2 text-sm text-pine">{item.title}</div>
                </button>
              ) : (
                <a href={item.url} target="_blank" rel="noreferrer" className="block">
                  {item.contentType.startsWith("video/") ? (
                    <video
                      className="aspect-video w-full bg-ink/90 object-cover"
                      src={item.url}
                      controls
                      preload="none"
                    />
                  ) : (
                    <LazyImage
                      src={item.url}
                      alt={item.title}
                      className="aspect-[4/3] w-full"
                    />
                  )}
                  <div className="px-3 py-2 text-sm text-pine">{item.title}</div>
                </a>
              )}
              {onRemove ? (
                <button
                  type="button"
                  onClick={() => onRemove(item.id)}
                  className="absolute right-2 top-2 rounded-full bg-ink/80 px-2 py-1 text-xs text-foam"
                >
                  Remove
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      {lightboxIndex !== null ? (
        <Lightbox
          images={imageItems.map(({ item }) => ({
            src: item.url,
            alt: item.title,
          }))}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      ) : null}
    </>
  );
}
