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
  /** Opens the tag-people flow for this photo (admin Media). */
  onTag?: (id: string) => void;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  showDownload?: boolean;
  showCaptions?: boolean;
  allowDownload?: boolean;
  /** When set, show this many photos first with a Load more control. */
  pageSize?: number;
};

function downloadUrl(src: string) {
  return `${src}${src.includes("?") ? "&" : "?"}download=1`;
}

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
  onTag,
  selectable,
  selectedIds,
  onToggleSelect,
  showDownload = false,
  showCaptions = true,
  allowDownload = true,
  pageSize,
}: MediaGridProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [visibleCount, setVisibleCount] = useState(pageSize && pageSize > 0 ? pageSize : items.length);

  useEffect(() => {
    setVisibleCount(pageSize && pageSize > 0 ? pageSize : items.length);
  }, [items, pageSize]);

  if (!items.length) {
    return <p className="text-sm text-pine">{emptyMessage}</p>;
  }

  const visibleItems = pageSize && pageSize > 0 ? items.slice(0, visibleCount) : items;
  const hasMore = Boolean(pageSize && pageSize > 0 && visibleCount < items.length);

  const imageItems = visibleItems
    .map((item, idx) => ({ item, idx }))
    .filter(
      ({ item }) =>
        item.contentType.startsWith("image/") &&
        item.provider !== "youtube",
    );

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visibleItems.map((item, idx) => {
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
                    <input
                      type="checkbox"
                      checked={!!isSelected}
                      onChange={() => onToggleSelect(item.id)}
                      className="h-4 w-4"
                      aria-label={`Select ${item.title}`}
                    />
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
                {showCaptions || item.availableUntil ? (
                  <div className="px-3 py-2 text-sm text-pine">
                    {showCaptions ? item.title : null}
                    {item.availableUntil ? (
                      <span className="mt-1 block text-xs text-pine">
                        Available until {new Date(item.availableUntil).toLocaleDateString()}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {onRemove ? (
                  <button
                    type="button"
                    onClick={() => onRemove(item.id)}
                    className="absolute right-2 top-2 rounded-full bg-ink/80 px-2 py-1 text-xs text-foam"
                    aria-label={`Remove ${item.title}`}
                  >
                    Remove
                  </button>
                ) : null}
                {onTag ? (
                  <button
                    type="button"
                    onClick={() => onTag(item.id)}
                    className="absolute bottom-2 right-2 rounded-full bg-ink px-3 py-1 text-xs text-foam"
                    aria-label={`Tag people in ${item.title}`}
                  >
                    Tag
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
                  <input
                    type="checkbox"
                    checked={!!isSelected}
                    onChange={() => onToggleSelect(item.id)}
                    className="h-4 w-4"
                    aria-label={`Select ${item.title}`}
                  />
                </label>
              ) : null}
              {isImage ? (
                <>
                  <button
                    type="button"
                    className="block w-full text-left"
                    aria-label={`View larger: ${item.title}`}
                    onClick={() => {
                      if (lightboxPosition >= 0) setLightboxIndex(lightboxPosition);
                    }}
                  >
                    <LazyImage
                      src={item.url}
                      alt=""
                      className="aspect-[4/3] w-full"
                    />
                    {showCaptions ? (
                      <div className="px-3 py-2 text-sm text-pine">{item.title}</div>
                    ) : null}
                  </button>
                  {onTag ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onTag(item.id);
                      }}
                      className={`absolute rounded-full bg-ink px-3 py-1 text-xs text-foam ${
                        showDownload ? "bottom-2 left-2" : "bottom-2 right-2"
                      }`}
                      aria-label={`Tag people in ${item.title}`}
                    >
                      Tag
                    </button>
                  ) : null}
                  {showDownload ? (
                    <a
                      href={downloadUrl(item.url)}
                      className="absolute bottom-2 right-2 rounded-full bg-ink/80 px-3 py-1 text-xs text-foam"
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Download ${item.title}`}
                    >
                      Download
                    </a>
                  ) : null}
                </>
              ) : (
                <a href={item.url} target="_blank" rel="noreferrer" className="block">
                  {item.contentType.startsWith("video/") ? (
                    <video
                      className="aspect-video w-full bg-ink/90 object-cover"
                      src={item.url}
                      controls
                      preload="none"
                      aria-label={item.title}
                    />
                  ) : (
                    <LazyImage
                      src={item.url}
                      alt={item.title}
                      className="aspect-[4/3] w-full"
                    />
                  )}
                  <div className="px-3 py-2 text-sm text-pine">
                    {item.title}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </div>
                </a>
              )}
              {onRemove ? (
                <button
                  type="button"
                  onClick={() => onRemove(item.id)}
                  className="absolute right-2 top-2 rounded-full bg-ink/80 px-2 py-1 text-xs text-foam"
                  aria-label={`Remove ${item.title}`}
                >
                  Remove
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      {hasMore ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setVisibleCount((n) => n + (pageSize || 24))}
            className="rounded-full border border-[color:var(--line)] bg-white px-4 py-2 text-sm text-ink hover:bg-mist"
          >
            Show more ({items.length - visibleCount} left)
          </button>
          <button
            type="button"
            onClick={() => setVisibleCount(items.length)}
            className="text-sm text-pine underline-offset-2 hover:underline"
          >
            Show all {items.length}
          </button>
        </div>
      ) : null}

      {lightboxIndex !== null ? (
        <Lightbox
          images={imageItems.map(({ item }) => ({
            src: item.url,
            alt: item.title,
          }))}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          allowDownload={allowDownload}
        />
      ) : null}
    </>
  );
}
