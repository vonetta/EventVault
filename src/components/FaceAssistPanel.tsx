"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GuestTagPicker } from "@/components/GuestTagPicker";
import {
  bestMatch,
  detectFacesInImage,
  loadFaceModels,
  type DetectedFace,
} from "@/lib/face-client";
import type { FaceLabeledProfile } from "@/lib/face-match";
import type { NameOnlyGuest } from "@/lib/guest-name-match";

type GalleryPhoto = {
  id: string;
  title: string;
  url: string;
  taggedGuestIds: string[];
  taggedNames: string[];
};

type FaceAssistPanelProps = {
  eventId: string;
  guests: NameOnlyGuest[];
  photos: GalleryPhoto[];
  onCreateGuest: (name: string) => Promise<NameOnlyGuest | null>;
  onGuestsChanged: () => Promise<void>;
  onPhotosChanged: () => Promise<void>;
  onMessage: (message: string) => void;
};

type SeedAssignment = {
  faceId: string;
  guestId: string;
};

type ScanHit = {
  mediaId: string;
  title: string;
  url: string;
  guestIds: string[];
  names: string[];
  distances: number[];
  selected: boolean;
};

export function FaceAssistPanel({
  eventId,
  guests,
  photos,
  onCreateGuest,
  onGuestsChanged,
  onPhotosChanged,
  onMessage,
}: FaceAssistPanelProps) {
  const [modelsStatus, setModelsStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [profiles, setProfiles] = useState<FaceLabeledProfile[]>([]);
  const [seedId, setSeedId] = useState("");
  const [faces, setFaces] = useState<DetectedFace[]>([]);
  const [assignments, setAssignments] = useState<SeedAssignment[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [savingSeed, setSavingSeed] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState({ done: 0, total: 0 });
  const [hits, setHits] = useState<ScanHit[]>([]);
  const [applying, setApplying] = useState(false);
  const [activeFaceId, setActiveFaceId] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0, naturalW: 1, naturalH: 1 });

  const seedPhoto = photos.find((photo) => photo.id === seedId) || null;
  const guestName = useMemo(() => {
    const map = new Map(guests.map((guest) => [guest._id, guest.name]));
    return (id: string) => map.get(id) || "Unknown";
  }, [guests]);

  useEffect(() => {
    let active = true;
    (async () => {
      setModelsStatus("loading");
      try {
        await loadFaceModels();
        if (!active) return;
        setModelsStatus("ready");
      } catch {
        if (!active) return;
        setModelsStatus("error");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!eventId) return;
    let active = true;
    (async () => {
      const res = await fetch(`/api/uploader/faces?eventId=${encodeURIComponent(eventId)}`);
      if (!res.ok || !active) return;
      const data = (await res.json()) as { profiles: FaceLabeledProfile[] };
      if (!active) return;
      setProfiles(data.profiles || []);
    })();
    return () => {
      active = false;
    };
  }, [eventId]);

  useEffect(() => {
    if (!seedId && photos[0]) setSeedId(photos[0].id);
  }, [photos, seedId]);

  function assignmentFor(faceId: string) {
    return assignments.find((item) => item.faceId === faceId)?.guestId || "";
  }

  function setAssignment(faceId: string, guestId: string) {
    setAssignments((prev) => {
      const without = prev.filter((item) => item.faceId !== faceId);
      if (!guestId) return without;
      return [...without, { faceId, guestId }];
    });
  }

  async function detectSeedFaces() {
    if (!seedPhoto || modelsStatus !== "ready") return;
    setDetecting(true);
    setFaces([]);
    setAssignments([]);
    setActiveFaceId(null);
    try {
      const detected = await detectFacesInImage(seedPhoto.url);
      setFaces(detected);
      if (!detected.length) {
        onMessage("No faces found in that photo. Try a clearer group shot.");
      } else {
        onMessage(`Found ${detected.length} face${detected.length === 1 ? "" : "s"}. Name each one.`);
      }
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Face detection failed");
    } finally {
      setDetecting(false);
    }
  }

  async function saveSeedProfiles() {
    if (!seedPhoto) return;
    const samples = faces
      .map((face) => {
        const guestId = assignmentFor(face.id);
        if (!guestId) return null;
        return { guestId, descriptor: face.descriptor };
      })
      .filter((sample): sample is { guestId: string; descriptor: number[] } => Boolean(sample));

    if (!samples.length) {
      onMessage("Name at least one face before saving.");
      return;
    }

    setSavingSeed(true);
    try {
      const res = await fetch("/api/uploader/faces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, samples }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        onMessage(json.error || "Could not save face samples");
        return;
      }

      // Also tag the seed photo with everyone named on it.
      const guestIds = [...new Set(samples.map((sample) => sample.guestId))];
      await fetch("/api/uploader/media/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaId: seedPhoto.id, taggedGuestIds: guestIds }),
      });

      const profilesRes = await fetch(`/api/uploader/faces?eventId=${encodeURIComponent(eventId)}`);
      if (profilesRes.ok) {
        const data = (await profilesRes.json()) as { profiles: FaceLabeledProfile[] };
        setProfiles(data.profiles || []);
      }
      await onPhotosChanged();
      onMessage(
        `Saved faces for ${json.guests} people. Next: scan the gallery to auto-tag matching photos.`,
      );
    } finally {
      setSavingSeed(false);
    }
  }

  async function scanGallery() {
    if (modelsStatus !== "ready") return;
    if (!profiles.length) {
      onMessage("Save a seed photo with named faces first.");
      return;
    }

    const targets = photos.filter((photo) => photo.id !== seedId);
    if (!targets.length) {
      onMessage("Upload more photos, then scan again.");
      return;
    }

    setScanning(true);
    setHits([]);
    setScanProgress({ done: 0, total: targets.length });
    const nextHits: ScanHit[] = [];

    for (let i = 0; i < targets.length; i++) {
      const photo = targets[i];
      setScanProgress({ done: i, total: targets.length });
      try {
        const detected = await detectFacesInImage(photo.url);
        const matched = new Map<string, number>();
        for (const face of detected) {
          const hit = bestMatch(face.descriptor, profiles, 0.55);
          if (!hit) continue;
          const prev = matched.get(hit.guestId);
          if (prev === undefined || hit.distance < prev) {
            matched.set(hit.guestId, hit.distance);
          }
        }
        if (!matched.size) continue;

        // Skip if this photo already has exactly these tags.
        const guestIds = [...matched.keys()];
        const already = new Set(photo.taggedGuestIds);
        if (guestIds.every((id) => already.has(id)) && guestIds.length === already.size) {
          continue;
        }

        nextHits.push({
          mediaId: photo.id,
          title: photo.title,
          url: photo.url,
          guestIds,
          names: guestIds.map((id) => guestName(id)),
          distances: guestIds.map((id) => matched.get(id) || 1),
          selected: true,
        });
        setHits([...nextHits]);
      } catch {
        // Skip failed images and continue the batch.
      }
    }

    setScanProgress({ done: targets.length, total: targets.length });
    setScanning(false);
    onMessage(
      nextHits.length
        ? `Found matches on ${nextHits.length} photo${nextHits.length === 1 ? "" : "s"}. Review and apply.`
        : "No new matches. Add another seed angle or lower the bar by naming more faces.",
    );
  }

  async function applySelected() {
    const selected = hits.filter((hit) => hit.selected);
    if (!selected.length) {
      onMessage("Select at least one photo to tag.");
      return;
    }
    setApplying(true);
    try {
      const res = await fetch("/api/uploader/faces/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          updates: selected.map((hit) => ({
            mediaId: hit.mediaId,
            guestIds: hit.guestIds,
          })),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        onMessage(json.error || "Could not apply tags");
        return;
      }
      onMessage(`Tagged ${json.photos} photo${json.photos === 1 ? "" : "s"}.`);
      setHits([]);
      await onPhotosChanged();
    } finally {
      setApplying(false);
    }
  }

  const namedCount = assignments.length;
  const profileCount = profiles.length;

  return (
    <section className="space-y-4 rounded-xl border border-[color:var(--line)] bg-white p-4">
      <div>
        <h2 className="font-[family-name:var(--font-fraunces)] text-xl text-ink">
          AI face tagging
        </h2>
        <p className="mt-1 text-sm text-pine">
          Pick one clear photo, name every face once, then scan the rest of the gallery. Matching
          runs in your browser — no cloud face service.
        </p>
        <p className="mt-1 text-xs text-pine">
          Models:{" "}
          {modelsStatus === "ready"
            ? "ready"
            : modelsStatus === "loading"
              ? "loading…"
              : modelsStatus === "error"
                ? "failed to load"
                : "idle"}
          {profileCount ? ` · ${profileCount} people in face library` : ""}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-[0.08em] text-pine">
            Seed photo
          </span>
          <select
            value={seedId}
            onChange={(e) => {
              setSeedId(e.target.value);
              setFaces([]);
              setAssignments([]);
            }}
            className="h-11 w-full rounded-lg border border-[color:var(--line)] bg-white px-3 text-ink outline-none focus-visible:border-ink"
          >
            {photos.length === 0 ? <option value="">Upload photos first</option> : null}
            {photos.map((photo) => (
              <option key={photo.id} value={photo.id}>
                {photo.title}
                {photo.taggedNames.length ? ` · ${photo.taggedNames.join(", ")}` : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={!seedPhoto || detecting || modelsStatus !== "ready"}
          onClick={() => void detectSeedFaces()}
          className="inline-flex h-11 items-center justify-center rounded-lg bg-ink px-4 text-sm font-medium text-foam disabled:cursor-not-allowed disabled:opacity-50"
        >
          {detecting ? "Finding faces…" : "Find faces in seed"}
        </button>
      </div>

      {seedPhoto ? (
        <div className="relative overflow-hidden rounded-lg border border-[color:var(--line)] bg-mist/30">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={seedPhoto.url}
            alt={seedPhoto.title}
            className="max-h-[28rem] w-full object-contain"
            onLoad={(e) => {
              const el = e.currentTarget;
              setImgSize({
                w: el.clientWidth,
                h: el.clientHeight,
                naturalW: el.naturalWidth || 1,
                naturalH: el.naturalHeight || 1,
              });
            }}
          />
          {faces.map((face) => {
            const scaleX = imgSize.w / imgSize.naturalW;
            const scaleY = imgSize.h / imgSize.naturalH;
            const left = face.box.x * scaleX;
            const top = face.box.y * scaleY;
            const width = face.box.width * scaleX;
            const height = face.box.height * scaleY;
            const named = assignmentFor(face.id);
            return (
              <button
                key={face.id}
                type="button"
                onClick={() => setActiveFaceId(face.id)}
                className={`absolute border-2 ${
                  activeFaceId === face.id
                    ? "border-ink bg-ink/10"
                    : named
                      ? "border-emerald-700/80"
                      : "border-foam"
                }`}
                style={{ left, top, width, height }}
                title={named ? guestName(named) : "Click to name"}
              />
            );
          })}
        </div>
      ) : null}

      {faces.length ? (
        <div className="space-y-3">
          <p className="text-sm text-ink">
            Name each face ({namedCount}/{faces.length}). Tip: a group shot with everyone works best
            as the first seed.
          </p>
          <ul className="space-y-3">
            {faces.map((face, index) => {
              const guestId = assignmentFor(face.id);
              return (
                <li
                  key={face.id}
                  className={`rounded-lg border p-3 ${
                    activeFaceId === face.id
                      ? "border-ink bg-mist/40"
                      : "border-[color:var(--line)] bg-white"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-ink">Face {index + 1}</p>
                    {guestId ? (
                      <span className="text-xs text-pine">{guestName(guestId)}</span>
                    ) : (
                      <span className="text-xs text-pine">Unnamed</span>
                    )}
                  </div>
                  <GuestTagPicker
                    compact
                    guests={guests}
                    selectedIds={guestId ? [guestId] : []}
                    onChange={(ids) => {
                      // One person per face box.
                      setAssignment(face.id, ids[ids.length - 1] || "");
                      setActiveFaceId(face.id);
                    }}
                    onCreateGuest={async (name) => {
                      const guest = await onCreateGuest(name);
                      if (guest) {
                        setAssignment(face.id, guest._id);
                        await onGuestsChanged();
                      }
                      return guest;
                    }}
                  />
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            disabled={savingSeed || namedCount === 0}
            onClick={() => void saveSeedProfiles()}
            className="inline-flex h-11 items-center justify-center rounded-lg bg-ink px-4 text-sm font-medium text-foam disabled:cursor-not-allowed disabled:opacity-50"
          >
            {savingSeed ? "Saving…" : `Save ${namedCount} face${namedCount === 1 ? "" : "s"} & tag seed photo`}
          </button>
        </div>
      ) : null}

      <div className="border-t border-[color:var(--line)] pt-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={scanning || modelsStatus !== "ready" || profileCount === 0}
            onClick={() => void scanGallery()}
            className="inline-flex h-11 items-center justify-center rounded-lg border border-ink bg-white px-4 text-sm font-medium text-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            {scanning
              ? `Scanning ${scanProgress.done}/${scanProgress.total}…`
              : "Scan gallery for these faces"}
          </button>
          {hits.length ? (
            <button
              type="button"
              disabled={applying}
              onClick={() => void applySelected()}
              className="inline-flex h-11 items-center justify-center rounded-lg bg-ink px-4 text-sm font-medium text-foam disabled:opacity-50"
            >
              {applying
                ? "Applying…"
                : `Apply tags to ${hits.filter((h) => h.selected).length} photo${
                    hits.filter((h) => h.selected).length === 1 ? "" : "s"
                  }`}
            </button>
          ) : null}
        </div>

        {hits.length ? (
          <ul className="mt-4 space-y-2">
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
                  className="h-14 w-14 rounded object-cover"
                  loading="lazy"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">{hit.names.join(", ")}</p>
                  <p className="text-xs text-pine">
                    match{" "}
                    {hit.distances
                      .map((d) => {
                        // face-api distance: ~0.3 strong, 0.55 cutoff
                        const pct = Math.max(1, Math.min(99, Math.round((1 - d) * 100)));
                        return `${pct}%`;
                      })
                      .join(", ")}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
