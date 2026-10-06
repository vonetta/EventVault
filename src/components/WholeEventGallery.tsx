"use client";

import { useEffect, useMemo, useState } from "react";
import { HighlightsReel } from "@/components/HighlightsReel";
import { MediaGrid, type MediaItem } from "@/components/MediaGrid";

export type DatedMediaItem = MediaItem & {
  createdAt?: string | null;
};

type WholeEventGalleryProps = {
  items: DatedMediaItem[];
  /** Auto-picked Weekend Highlights (20–40 strongest). */
  highlights?: MediaItem[];
  emptyMessage?: string;
  /** Photos per page for large albums. */
  pageSize?: number;
};

/**
 * Guest Whole-event browser for large flat albums.
 * Optional Weekend Highlights reel sits above flat page browsing.
 */
export function WholeEventGallery({
  items,
  highlights = [],
  emptyMessage = "Whole-event photos will appear here after they’re uploaded.",
  pageSize = 48,
}: WholeEventGalleryProps) {
  const [page, setPage] = useState(0);

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

  if (!items.length) {
    return <p className="text-sm text-pine">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-6">
      {highlights.length ? <HighlightsReel items={highlights} /> : null}

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
    </div>
  );
}
