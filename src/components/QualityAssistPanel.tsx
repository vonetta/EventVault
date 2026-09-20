"use client";

import { useState } from "react";
import {
  analyzePhotoQuality,
  DUPLICATE_HAMMING_MAX,
  hammingHex64,
  mapPool,
} from "@/lib/photo-quality";

type GalleryPhoto = {
  id: string;
  title: string;
  url: string;
  needsEditing: boolean;
};

type QualityAssistPanelProps = {
  eventId: string;
  photos: GalleryPhoto[];
  onPhotosChanged: () => Promise<void>;
  onMessage: (message: string) => void;
};

type SoftHit = {
  mediaId: string;
  title: string;
  url: string;
  reasons: string[];
  selected: boolean;
};

type DupGroup = {
  key: string;
  keepId: string;
  members: { mediaId: string; title: string; url: string; selected: boolean }[];
};

const APPLY_CHUNK = 200;
const SCAN_CONCURRENCY = 4;

export function QualityAssistPanel({
  eventId,
  photos,
  onPhotosChanged,
  onMessage,
}: QualityAssistPanelProps) {
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [softHits, setSoftHits] = useState<SoftHit[]>([]);
  const [dupGroups, setDupGroups] = useState<DupGroup[]>([]);
  const [applying, setApplying] = useState(false);

  async function scanQuality() {
    if (!photos.length) {
      onMessage("Upload photos first.");
      return;
    }

    setScanning(true);
    setSoftHits([]);
    setDupGroups([]);
    setProgress({ done: 0, total: photos.length });

    type Analyzed = {
      photo: GalleryPhoto;
      aHash: string;
      needsEditing: boolean;
      reasons: string[];
    };

    const analyzed = await mapPool(
      photos,
      SCAN_CONCURRENCY,
      async (photo) => {
        try {
          const quality = await analyzePhotoQuality(photo.url);
          return {
            photo,
            aHash: quality.aHash,
            needsEditing: quality.needsEditing,
            reasons: quality.reasons,
          } satisfies Analyzed;
        } catch {
          return {
            photo,
            aHash: "",
            needsEditing: false,
            reasons: [],
          } satisfies Analyzed;
        }
      },
      (done, total) => setProgress({ done, total }),
    );

    const soft: SoftHit[] = analyzed
      .filter((item) => item.needsEditing && !item.photo.needsEditing)
      .map((item) => ({
        mediaId: item.photo.id,
        title: item.photo.title,
        url: item.photo.url,
        reasons: item.reasons,
        selected: true,
      }));

    // Greedy near-duplicate clustering by aHash Hamming distance.
    const withHash = analyzed.filter((item) => item.aHash.length === 16);
    const used = new Set<string>();
    const groups: DupGroup[] = [];

    for (let i = 0; i < withHash.length; i++) {
      const seed = withHash[i];
      if (used.has(seed.photo.id)) continue;
      const members = [seed];
      used.add(seed.photo.id);
      for (let j = i + 1; j < withHash.length; j++) {
        const other = withHash[j];
        if (used.has(other.photo.id)) continue;
        if (hammingHex64(seed.aHash, other.aHash) <= DUPLICATE_HAMMING_MAX) {
          members.push(other);
          used.add(other.photo.id);
        }
      }
      if (members.length < 2) continue;
      // Keep the first (newest in gallery sort) as the keeper; flag the rest.
      const keep = members[0];
      groups.push({
        key: keep.photo.id,
        keepId: keep.photo.id,
        members: members.map((member, index) => ({
          mediaId: member.photo.id,
          title: member.photo.title,
          url: member.photo.url,
          selected: index > 0 && !member.photo.needsEditing,
        })),
      });
    }

    setSoftHits(soft);
    setDupGroups(groups);
    setScanning(false);

    const dupCount = groups.reduce(
      (sum, group) => sum + group.members.filter((m) => m.mediaId !== group.keepId).length,
      0,
    );
    onMessage(
      soft.length || dupCount
        ? `Quality pass: ${soft.length} soft/exposure issue${soft.length === 1 ? "" : "s"}, ${dupCount} near-duplicate${dupCount === 1 ? "" : "s"} to review.`
        : "Quality pass: nothing obvious. Looks good.",
    );
  }

  async function applySelected() {
    const updates = new Map<string, boolean>();
    for (const hit of softHits) {
      if (hit.selected) updates.set(hit.mediaId, true);
    }
    for (const group of dupGroups) {
      for (const member of group.members) {
        if (member.mediaId === group.keepId) continue;
        if (member.selected) updates.set(member.mediaId, true);
      }
    }

    if (!updates.size) {
      onMessage("Select at least one photo to mark Needs editing.");
      return;
    }

    setApplying(true);
    try {
      const entries = [...updates.entries()].map(([mediaId, needsEditing]) => ({
        mediaId,
        needsEditing,
      }));
      let photosUpdated = 0;
      for (let i = 0; i < entries.length; i += APPLY_CHUNK) {
        const chunk = entries.slice(i, i + APPLY_CHUNK);
        const res = await fetch("/api/uploader/media/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventId, updates: chunk }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          onMessage(json.error || "Could not apply quality marks");
          return;
        }
        photosUpdated += Number(json.photos) || 0;
      }
      onMessage(
        `Moved ${photosUpdated} photo${photosUpdated === 1 ? "" : "s"} to Needs editing.`,
      );
      setSoftHits([]);
      setDupGroups([]);
      await onPhotosChanged();
    } finally {
      setApplying(false);
    }
  }

  const selectedCount =
    softHits.filter((h) => h.selected).length +
    dupGroups.reduce(
      (sum, group) =>
        sum +
        group.members.filter((m) => m.selected && m.mediaId !== group.keepId).length,
      0,
    );

  return (
    <section className="space-y-4 rounded-xl border border-[color:var(--line)] bg-white p-4">
      <div>
        <h2 className="font-[family-name:var(--font-fraunces)] text-xl text-ink">
          Quality & duplicates
        </h2>
        <p className="mt-1 text-sm text-pine">
          Scan the gallery for blurry, too-dark, blown-out, or near-duplicate shots. Flagged
          photos move to Needs editing so guests never see the rejects.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={scanning || photos.length === 0}
          onClick={() => void scanQuality()}
          className="inline-flex h-11 items-center justify-center rounded-lg border border-ink bg-white px-4 text-sm font-medium text-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          {scanning
            ? `Checking ${progress.done}/${progress.total}…`
            : `Check ${photos.length || ""} photo${photos.length === 1 ? "" : "s"}`}
        </button>
        {selectedCount > 0 ? (
          <button
            type="button"
            disabled={applying}
            onClick={() => void applySelected()}
            className="inline-flex h-11 items-center justify-center rounded-lg bg-ink px-4 text-sm font-medium text-foam disabled:opacity-50"
          >
            {applying
              ? "Applying…"
              : `Mark ${selectedCount} Needs editing`}
          </button>
        ) : null}
      </div>

      {softHits.length ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-ink">Soft / exposure issues</p>
          <ul className="space-y-2">
            {softHits.map((hit) => (
              <li
                key={hit.mediaId}
                className="flex items-center gap-3 rounded-lg border border-[color:var(--line)] bg-mist/30 p-2"
              >
                <input
                  type="checkbox"
                  checked={hit.selected}
                  onChange={(e) =>
                    setSoftHits((prev) =>
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
                  className="h-14 w-14 rounded object-cover"
                  loading="lazy"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">{hit.title}</p>
                  <p className="text-xs text-pine">{hit.reasons.join(", ")}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {dupGroups.length ? (
        <div className="space-y-3">
          <p className="text-sm font-medium text-ink">Near-duplicates</p>
          {dupGroups.map((group) => (
            <div
              key={group.key}
              className="space-y-2 rounded-lg border border-[color:var(--line)] p-3"
            >
              <p className="text-xs text-pine">
                Keep one · mark the rest Needs editing (or uncheck to leave them)
              </p>
              <ul className="space-y-2">
                {group.members.map((member) => {
                  const isKeep = member.mediaId === group.keepId;
                  return (
                    <li key={member.mediaId} className="flex items-center gap-3">
                      {isKeep ? (
                        <span className="w-4 text-center text-xs text-pine">★</span>
                      ) : (
                        <input
                          type="checkbox"
                          checked={member.selected}
                          onChange={(e) =>
                            setDupGroups((prev) =>
                              prev.map((g) =>
                                g.key !== group.key
                                  ? g
                                  : {
                                      ...g,
                                      members: g.members.map((m) =>
                                        m.mediaId === member.mediaId
                                          ? { ...m, selected: e.target.checked }
                                          : m,
                                      ),
                                    },
                              ),
                            )
                          }
                          className="h-4 w-4"
                        />
                      )}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={member.url}
                        alt=""
                        className="h-14 w-14 rounded object-cover"
                        loading="lazy"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-ink">{member.title}</p>
                        <p className="text-xs text-pine">
                          {isKeep ? "Keeper" : "Near duplicate"}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
