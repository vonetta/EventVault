"use client";

import { useState } from "react";
import { countFacesInImage, loadFaceModels } from "@/lib/face-client";
import { mapPool } from "@/lib/photo-quality";

type GalleryPhoto = {
  id: string;
  title: string;
  url: string;
  needsEditing: boolean;
};

type GroupPhotoAssistPanelProps = {
  eventId: string;
  photos: GalleryPhoto[];
  onPhotosChanged: () => Promise<void>;
  onMessage: (message: string) => void;
};

type GroupHit = {
  mediaId: string;
  title: string;
  url: string;
  faceCount: number;
  selected: boolean;
};

const SCAN_CONCURRENCY = 3;
/** Photos with at least this many detected faces are group-shot candidates. */
const DEFAULT_MIN_FACES = 3;

export function GroupPhotoAssistPanel({
  eventId,
  photos,
  onPhotosChanged,
  onMessage,
}: GroupPhotoAssistPanelProps) {
  const [minFaces, setMinFaces] = useState(DEFAULT_MIN_FACES);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [hits, setHits] = useState<GroupHit[]>([]);
  const [publishing, setPublishing] = useState(false);

  const readyPhotos = photos.filter((photo) => !photo.needsEditing);
  const selectedCount = hits.filter((hit) => hit.selected).length;

  async function scanForGroups() {
    if (!readyPhotos.length) {
      onMessage("No ready photos to scan. Upload first, or clear Needs editing.");
      return;
    }

    setScanning(true);
    setHits([]);
    setProgress({ done: 0, total: readyPhotos.length });
    onMessage("Looking for group shots (photos with several faces)…");

    try {
      await loadFaceModels();
    } catch {
      setScanning(false);
      onMessage("Face models failed to load. Refresh and try again.");
      return;
    }

    const results = await mapPool(
      readyPhotos,
      SCAN_CONCURRENCY,
      async (photo) => {
        try {
          const faceCount = await countFacesInImage(photo.url);
          if (faceCount < minFaces) return null;
          return {
            mediaId: photo.id,
            title: photo.title,
            url: photo.url,
            faceCount,
            selected: true,
          } as GroupHit;
        } catch {
          return null;
        }
      },
      (done, total) => setProgress({ done, total }),
    );

    const nextHits = results
      .filter((hit): hit is GroupHit => hit !== null)
      .sort((a, b) => b.faceCount - a.faceCount);

    setHits(nextHits);
    setScanning(false);
    onMessage(
      nextHits.length
        ? `Found ${nextHits.length} likely group photo${nextHits.length === 1 ? "" : "s"} (${minFaces}+ faces). Review, then make them free for everyone.`
        : `No photos with ${minFaces}+ faces. Try a lower threshold, or these may mostly be portraits.`,
    );
  }

  async function publishSelected() {
    const selected = hits.filter((hit) => hit.selected);
    if (!selected.length) {
      onMessage("Select at least one group photo.");
      return;
    }

    setPublishing(true);
    try {
      const mediaIds = selected.map((hit) => hit.mediaId);
      let sent = 0;
      const CHUNK = 200;
      for (let i = 0; i < mediaIds.length; i += CHUNK) {
        const chunk = mediaIds.slice(i, i + CHUNK);
        const res = await fetch("/api/uploader/media/publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventId, mediaIds: chunk, everyone: true }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          onMessage(json.error || "Could not publish group photos");
          return;
        }
        sent += Number(json.sent) || 0;
      }

      onMessage(
        `Published ${sent} photo${sent === 1 ? "" : "s"} to Whole event — free for all guests.`,
      );
      setHits((prev) => prev.filter((hit) => !hit.selected));
      await onPhotosChanged();
    } finally {
      setPublishing(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-[color:var(--line)] bg-white p-4">
      <div>
        <h2 className="font-[family-name:var(--font-fraunces)] text-xl text-ink">
          Group photos → Whole event
        </h2>
        <p className="mt-1 text-sm text-pine">
          AI finds shots with several people (no tagging needed). Review the list, then one click
          puts them in the free whole-event album.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-[0.08em] text-pine">
            Min faces
          </span>
          <select
            value={minFaces}
            disabled={scanning}
            onChange={(e) => setMinFaces(Number(e.target.value))}
            className="h-11 rounded-lg border border-[color:var(--line)] bg-white px-3 text-sm text-ink outline-none focus-visible:border-ink"
          >
            <option value={2}>2+ faces</option>
            <option value={3}>3+ faces</option>
            <option value={4}>4+ faces</option>
            <option value={5}>5+ faces</option>
          </select>
        </label>
        <button
          type="button"
          disabled={scanning || readyPhotos.length === 0}
          onClick={() => void scanForGroups()}
          className="inline-flex h-11 items-center justify-center rounded-lg border border-ink bg-white px-4 text-sm font-medium text-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          {scanning
            ? `Scanning ${progress.done}/${progress.total}…`
            : `Find group photos (${readyPhotos.length})`}
        </button>
        {selectedCount > 0 ? (
          <button
            type="button"
            disabled={publishing || scanning}
            onClick={() => void publishSelected()}
            className="inline-flex h-11 items-center justify-center rounded-lg bg-ink px-4 text-sm font-medium text-foam disabled:opacity-50"
          >
            {publishing
              ? "Publishing…"
              : `Make ${selectedCount} free for everyone`}
          </button>
        ) : null}
      </div>

      {hits.length ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm text-pine">
            <span>
              {hits.length} candidate{hits.length === 1 ? "" : "s"} · {selectedCount} selected
            </span>
            <button
              type="button"
              className="underline hover:text-ink"
              onClick={() =>
                setHits((prev) => prev.map((hit) => ({ ...hit, selected: true })))
              }
            >
              Select all
            </button>
            <button
              type="button"
              className="underline hover:text-ink"
              onClick={() =>
                setHits((prev) => prev.map((hit) => ({ ...hit, selected: false })))
              }
            >
              Clear
            </button>
          </div>
          <ul className="grid max-h-[28rem] grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
            {hits.map((hit) => (
              <li
                key={hit.mediaId}
                className="flex items-center gap-3 rounded-lg border border-[color:var(--line)] bg-mist/30 p-2"
              >
                <input
                  type="checkbox"
                  checked={hit.selected}
                  onChange={(e) =>
                    setHits((prev) =>
                      prev.map((item) =>
                        item.mediaId === hit.mediaId
                          ? { ...item, selected: e.target.checked }
                          : item,
                      ),
                    )
                  }
                  className="h-4 w-4"
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={hit.url}
                  alt=""
                  className="h-16 w-16 rounded object-cover"
                  loading="lazy"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">{hit.title}</p>
                  <p className="text-xs text-pine">
                    {hit.faceCount} face{hit.faceCount === 1 ? "" : "s"} detected
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
