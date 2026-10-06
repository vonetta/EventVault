"use client";

import { useMemo, useState } from "react";
import { MediaGrid, type MediaItem } from "@/components/MediaGrid";

export type DatedMediaItem = MediaItem & {
  createdAt?: string | null;
};

function dayKey(iso?: string | null) {
  if (!iso) return "unknown";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  return d.toISOString().slice(0, 10);
}

function formatDayLabel(key: string) {
  if (key === "unknown") return "Other";
  const d = new Date(`${key}T12:00:00`);
  if (Number.isNaN(d.getTime())) return key;
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

type WholeEventGalleryProps = {
  items: DatedMediaItem[];
  emptyMessage?: string;
};

/**
 * Guest Whole-event browser for large albums: filter by upload day, sort, and
 * section the grid so 700+ photos are easier to skim.
 */
export function WholeEventGallery({
  items,
  emptyMessage = "Whole-event photos will appear here after they’re uploaded.",
}: WholeEventGalleryProps) {
  const [dayFilter, setDayFilter] = useState<string>("all");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");

  const dayCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      const key = dayKey(item.createdAt);
      map.set(key, (map.get(key) || 0) + 1);
    }
    return [...map.entries()]
      .filter(([key]) => key !== "unknown" || map.size === 1)
      .sort((a, b) => b[0].localeCompare(a[0]));
  }, [items]);

  const showDayFilters = dayCounts.length > 1;

  const filtered = useMemo(() => {
    let list =
      dayFilter === "all"
        ? items
        : items.filter((item) => dayKey(item.createdAt) === dayFilter);
    list = [...list].sort((a, b) => {
      const aT = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bT = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return sort === "newest" ? bT - aT : aT - bT;
    });
    return list;
  }, [items, dayFilter, sort]);

  const sections = useMemo(() => {
    if (dayFilter !== "all" || !showDayFilters) {
      return [{ key: dayFilter === "all" ? "all" : dayFilter, label: "", items: filtered }];
    }
    const byDay = new Map<string, DatedMediaItem[]>();
    for (const item of filtered) {
      const key = dayKey(item.createdAt);
      const list = byDay.get(key) || [];
      list.push(item);
      byDay.set(key, list);
    }
    const keys = [...byDay.keys()].sort((a, b) =>
      sort === "newest" ? b.localeCompare(a) : a.localeCompare(b),
    );
    return keys.map((key) => ({
      key,
      label: `${formatDayLabel(key)} · ${byDay.get(key)!.length}`,
      items: byDay.get(key)!,
    }));
  }, [filtered, dayFilter, showDayFilters, sort]);

  if (!items.length) {
    return <p className="text-sm text-pine">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {showDayFilters ? (
          <>
            <button
              type="button"
              onClick={() => setDayFilter("all")}
              aria-pressed={dayFilter === "all"}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                dayFilter === "all" ? "bg-ink text-foam" : "bg-mist text-pine hover:text-ink"
              }`}
            >
              All ({items.length})
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
          </>
        ) : null}
        <label className="ml-auto flex items-center gap-2 text-xs text-pine">
          <span className="sr-only">Sort Whole event photos</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as "newest" | "oldest")}
            className="h-9 rounded-lg border border-[color:var(--line)] bg-white px-2 text-xs text-ink"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </label>
      </div>

      <p className="text-xs text-pine">
        Showing {filtered.length} of {items.length} photos
        {dayFilter !== "all" ? ` · ${formatDayLabel(dayFilter)}` : ""}.
      </p>

      {sections.map((section) => (
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
            pageSize={36}
            emptyMessage={emptyMessage}
          />
        </div>
      ))}
    </div>
  );
}
