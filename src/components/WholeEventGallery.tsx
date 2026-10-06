"use client";

import { useEffect, useMemo, useState } from "react";
import { GalleryOpening } from "@/components/GalleryOpening";
import { HighlightsReel } from "@/components/HighlightsReel";
import { Lightbox } from "@/components/Lightbox";
import { MediaGrid, type MediaItem } from "@/components/MediaGrid";
import {
  hasEnteredWeekend,
  markEnteredWeekend,
  readFavoriteIds,
  toggleFavoriteId,
  writeFavoriteIds,
} from "@/lib/gallery-favorites";

export type DatedMediaItem = MediaItem & {
  createdAt?: string | null;
};

type WholeEventGalleryProps = {
  items: DatedMediaItem[];
  highlights?: MediaItem[];
  eventId: string;
  eventName: string;
  /** Guest has Photos of you section above. */
  hasPersonalPhotos?: boolean;
  emptyMessage?: string;
  pageSize?: number;
};

/**
 * Guest Whole-event experience: opening moment → highlights → recap →
 * favorites → flat page browse. No day labeling required.
 */
export function WholeEventGallery({
  items,
  highlights = [],
  eventId,
  eventName,
  hasPersonalPhotos = false,
  emptyMessage = "Whole-event photos will appear here after they’re uploaded.",
  pageSize = 48,
}: WholeEventGalleryProps) {
  const [page, setPage] = useState(0);
  const [entered, setEntered] = useState<boolean | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [recapOpen, setRecapOpen] = useState(false);
  const [savingFavorites, setSavingFavorites] = useState(false);
  const [favoritesMessage, setFavoritesMessage] = useState("");

  useEffect(() => {
    if (!eventId) {
      setEntered(true);
      return;
    }
    setEntered(hasEnteredWeekend(eventId));
    setFavoriteIds(readFavoriteIds(eventId));
  }, [eventId]);

  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  useEffect(() => {
    setPage(0);
  }, [items]);

  useEffect(() => {
    if (page > totalPages - 1) setPage(Math.max(0, totalPages - 1));
  }, [page, totalPages]);

  const pageItems = useMemo(() => {
    const start = page * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  const startN = items.length ? page * pageSize + 1 : 0;
  const endN = Math.min(items.length, (page + 1) * pageSize);

  const pageButtons = useMemo(() => {
    if (totalPages <= 1) return [] as number[];
    const window = 5;
    let from = Math.max(0, page - Math.floor(window / 2));
    let to = Math.min(totalPages - 1, from + window - 1);
    from = Math.max(0, to - window + 1);
    const list: number[] = [];
    for (let i = from; i <= to; i++) list.push(i);
    return list;
  }, [page, totalPages]);

  const hero = highlights[0] || items.find((item) => item.contentType?.startsWith("image/")) || null;

  function enterWeekend() {
    markEnteredWeekend(eventId);
    setEntered(true);
  }

  function onToggleFavorite(id: string) {
    const next = toggleFavoriteId(eventId, id);
    setFavoriteIds(next);
  }

  async function downloadFavorites() {
    if (!favoriteIds.length) return;
    setSavingFavorites(true);
    setFavoritesMessage("Preparing your favorites ZIP…");
    try {
      const params = new URLSearchParams({ ids: favoriteIds.join(",") });
      const response = await fetch(`/api/guest/download?${params.toString()}`);
      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        setFavoritesMessage(json.error || "Could not prepare favorites");
        return;
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] || "weekend-favorites.zip";
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setFavoritesMessage("Favorites saved to your downloads.");
    } catch {
      setFavoritesMessage("Could not prepare favorites");
    } finally {
      setSavingFavorites(false);
    }
  }

  function clearFavorites() {
    writeFavoriteIds(eventId, []);
    setFavoriteIds([]);
    setFavoritesMessage("");
  }

  if (!items.length) {
    return <p className="text-sm text-pine">{emptyMessage}</p>;
  }

  if (entered === null) {
    return <p className="text-sm text-pine">Loading the weekend…</p>;
  }

  if (!entered) {
    return (
      <GalleryOpening
        eventName={eventName}
        hero={hero}
        photoCount={items.length}
        highlightCount={highlights.length}
        onEnter={enterWeekend}
      />
    );
  }

  return (
    <div className="ev-fade-in space-y-6">
      {highlights.length ? <HighlightsReel items={highlights} /> : null}

      <div className="flex flex-wrap items-center gap-2">
        {highlights.length >= 8 ? (
          <button
            type="button"
            onClick={() => setRecapOpen(true)}
            className="rounded-full bg-ink px-4 py-2 text-xs font-medium text-foam transition hover:bg-pine"
          >
            Weekend in 2 minutes
          </button>
        ) : null}
        {favoriteIds.length ? (
          <>
            <button
              type="button"
              disabled={savingFavorites}
              onClick={() => void downloadFavorites()}
              className="rounded-full border border-[color:var(--line)] bg-white px-4 py-2 text-xs font-medium text-ink disabled:opacity-50"
            >
              {savingFavorites
                ? "Preparing…"
                : `Save my favorites (${favoriteIds.length})`}
            </button>
            <button
              type="button"
              onClick={clearFavorites}
              className="rounded-full px-3 py-2 text-xs text-pine underline-offset-2 hover:underline"
            >
              Clear saves
            </button>
          </>
        ) : (
          <p className="text-xs text-pine">
            Tap a photo, then ♡ Save keepers as you browse.
          </p>
        )}
      </div>

      {favoritesMessage ? (
        <p role="status" className="text-sm text-pine">
          {favoritesMessage}
        </p>
      ) : null}

      {hasPersonalPhotos ? (
        <p className="rounded-2xl border border-[color:var(--line)] bg-mist/50 px-4 py-3 text-sm text-pine">
          Looking for yourself?{" "}
          <a href="#personal-photos" className="font-medium text-ink underline-offset-4 hover:underline">
            Photos of you
          </a>{" "}
          is above — personalized shots stay there. This album is the whole weekend for everyone.
        </p>
      ) : null}

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm text-pine">
          <span>
            Showing {startN}–{endN} of {items.length}
          </span>
          {totalPages > 1 ? (
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="rounded-lg border border-[color:var(--line)] bg-white px-3 py-1.5 text-xs text-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              {pageButtons[0] > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => setPage(0)}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                      page === 0 ? "bg-ink text-foam" : "bg-mist text-pine hover:text-ink"
                    }`}
                  >
                    1
                  </button>
                  {pageButtons[0] > 1 ? <span className="px-1 text-xs text-pine">…</span> : null}
                </>
              ) : null}
              {pageButtons.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-current={page === n ? "page" : undefined}
                  onClick={() => setPage(n)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                    page === n ? "bg-ink text-foam" : "bg-mist text-pine hover:text-ink"
                  }`}
                >
                  {n + 1}
                </button>
              ))}
              {pageButtons[pageButtons.length - 1] < totalPages - 1 ? (
                <>
                  {pageButtons[pageButtons.length - 1] < totalPages - 2 ? (
                    <span className="px-1 text-xs text-pine">…</span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setPage(totalPages - 1)}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                      page === totalPages - 1
                        ? "bg-ink text-foam"
                        : "bg-mist text-pine hover:text-ink"
                    }`}
                  >
                    {totalPages}
                  </button>
                </>
              ) : null}
              <button
                type="button"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                className="rounded-lg border border-[color:var(--line)] bg-white px-3 py-1.5 text-xs text-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          ) : null}
        </div>

        <MediaGrid
          items={pageItems}
          showDownload
          showCaptions={false}
          emptyMessage={emptyMessage}
          favoriteIds={favoriteSet}
          onToggleFavorite={onToggleFavorite}
        />

        {totalPages > 1 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-pine">
            <span>
              Page {page + 1} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => {
                  setPage((p) => Math.max(0, p - 1));
                  document
                    .getElementById("event-gallery")
                    ?.scrollIntoView({ behavior: "smooth" });
                }}
                className="rounded-lg border border-[color:var(--line)] bg-white px-3 py-1.5 text-xs text-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages - 1}
                onClick={() => {
                  setPage((p) => Math.min(totalPages - 1, p + 1));
                  document
                    .getElementById("event-gallery")
                    ?.scrollIntoView({ behavior: "smooth" });
                }}
                className="rounded-lg border border-[color:var(--line)] bg-white px-3 py-1.5 text-xs text-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {recapOpen ? (
        <Lightbox
          images={highlights.map((item) => ({
            id: item.id,
            src: item.url,
            alt: item.title || "Highlight",
          }))}
          startIndex={0}
          onClose={() => setRecapOpen(false)}
          allowDownload
          favoriteIds={favoriteSet}
          onToggleFavorite={onToggleFavorite}
          autoplayMs={3200}
        />
      ) : null}
    </div>
  );
}
