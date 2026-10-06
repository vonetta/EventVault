"use client";

import { useEffect, useMemo, useState } from "react";
import { MediaGrid, type MediaItem } from "@/components/MediaGrid";

export type DatedMediaItem = MediaItem & {
  createdAt?: string | null;
  /** Camera capture time (EXIF DateTimeOriginal), when known. */
  takenAt?: string | null;
};

function dayKeyFromTakenAt(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function formatDayLabel(key: string) {
  const d = new Date(`${key}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return key;
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

type WholeEventGalleryProps = {
  items: DatedMediaItem[];
  emptyMessage?: string;
  pageSize?: number;
};

/**
 * Guest Whole-event browser.
 * When camera taken-at dates exist, section/filter by shoot day.
 * Otherwise page through the flat album (upload date is not used).
 */
export function WholeEventGallery({
  items,
  emptyMessage = "Whole-event photos will appear here after they’re uploaded.",
  pageSize = 48,
}: WholeEventGalleryProps) {
  const [dayFilter, setDayFilter] = useState<string>("all");
  const [page, setPage] = useState(0);

  const dayCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      const key = dayKeyFromTakenAt(item.takenAt);
      if (!key) continue;
      map.set(key, (map.get(key) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  const withTakenAt = useMemo(
    () => items.filter((item) => Boolean(dayKeyFromTakenAt(item.takenAt))).length,
    [items],
  );
  const useCameraDays = dayCounts.length >= 1 && withTakenAt >= Math.min(12, items.length * 0.2);

  const filtered = useMemo(() => {
    if (!useCameraDays || dayFilter === "all") {
      return [...items].sort((a, b) => {
        const aT = a.takenAt ? new Date(a.takenAt).getTime() : 0;
        const bT = b.takenAt ? new Date(b.takenAt).getTime() : 0;
        if (aT && bT) return aT - bT;
        if (aT) return -1;
        if (bT) return 1;
        return 0;
      });
    }
    return items
      .filter((item) => dayKeyFromTakenAt(item.takenAt) === dayFilter)
      .sort((a, b) => {
        const aT = a.takenAt ? new Date(a.takenAt).getTime() : 0;
        const bT = b.takenAt ? new Date(b.takenAt).getTime() : 0;
        return aT - bT;
      });
  }, [items, dayFilter, useCameraDays]);

  const sections = useMemo(() => {
    if (!useCameraDays || dayFilter !== "all") {
      return [{ key: "page", label: "", items: filtered }];
    }
    const byDay = new Map<string, DatedMediaItem[]>();
    const undated: DatedMediaItem[] = [];
    for (const item of filtered) {
      const key = dayKeyFromTakenAt(item.takenAt);
      if (!key) {
        undated.push(item);
        continue;
      }
      const list = byDay.get(key) || [];
      list.push(item);
      byDay.set(key, list);
    }
    const keys = [...byDay.keys()].sort((a, b) => a.localeCompare(b));
    const out = keys.map((key) => ({
      key,
      label: `${formatDayLabel(key)} · ${byDay.get(key)!.length}`,
      items: byDay.get(key)!,
    }));
    if (undated.length) {
      out.push({ key: "undated", label: `Date unknown · ${undated.length}`, items: undated });
    }
    return out;
  }, [filtered, dayFilter, useCameraDays]);

  // Flat paging only when we are not showing multi-day section headers.
  const pagingMode = !useCameraDays || dayFilter !== "all" || sections.length <= 1;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  useEffect(() => {
    setPage(0);
  }, [dayFilter, items, useCameraDays]);

  useEffect(() => {
    if (page > totalPages - 1) setPage(Math.max(0, totalPages - 1));
  }, [page, totalPages]);

  const pagedSections = useMemo(() => {
    if (!pagingMode) return sections;
    const start = page * pageSize;
    return [
      {
        key: "page",
        label: "",
        items: filtered.slice(start, start + pageSize),
      },
    ];
  }, [pagingMode, sections, filtered, page, pageSize]);

  if (!items.length) {
    return <p className="text-sm text-pine">{emptyMessage}</p>;
  }

  const startN = filtered.length ? (pagingMode ? page * pageSize + 1 : 1) : 0;
  const endN = pagingMode
    ? Math.min(filtered.length, (page + 1) * pageSize)
    : filtered.length;

  return (
    <div className="space-y-4">
      {useCameraDays ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setDayFilter("all")}
            aria-pressed={dayFilter === "all"}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              dayFilter === "all" ? "bg-ink text-foam" : "bg-mist text-pine hover:text-ink"
            }`}
          >
            All days ({items.length})
          </button>
          {dayCounts.map(([key, count]) => (
            <button
              key={key}
              type="button"
              onClick={() => setDayFilter(key)}
              aria-pressed={dayFilter === key}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                dayFilter === key ? "bg-ink text-foam" : "bg-mist text-pine hover:text-ink"
              }`}
            >
              {formatDayLabel(key)} ({count})
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 text-sm text-pine">
        <span>
          Showing {startN}–{endN} of {filtered.length}
          {useCameraDays
            ? " · by camera date"
            : withTakenAt === 0
              ? " · camera dates not available yet"
              : ""}
        </span>
        {pagingMode && totalPages > 1 ? (
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="rounded-lg border border-[color:var(--line)] bg-white px-3 py-1.5 text-xs text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-xs">
              Page {page + 1} / {totalPages}
            </span>
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

      {pagedSections.map((section) => (
        <div key={section.key} className="space-y-3">
          {section.label ? (
            <h3 className="text-sm font-medium uppercase tracking-[0.08em] text-pine">
              {section.label}
            </h3>
          ) : null}
          <MediaGrid
            items={section.items}
            showDownload
            showCaptions={false}
            emptyMessage={emptyMessage}
          />
        </div>
      ))}
    </div>
  );
}
