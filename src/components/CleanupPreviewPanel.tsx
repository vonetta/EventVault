"use client";

import { useMemo, useState } from "react";
import {
  CLEANUP_ENGINE,
  CLEANUP_PRESETS,
  CLEANUP_PRESET_HINTS,
  CLEANUP_PRESET_LABELS,
  isCleanupPreset,
  type CleanupPreset,
} from "@/lib/cleanup-engine";

export type CleanupPhoto = {
  id: string;
  title: string;
  url: string;
  taggedNames?: string[];
  hasCleanupPreview?: boolean;
  cleanupPreviewUrl?: string | null;
  cleanupPreviewEngine?: string;
  cleanupPreviewPreset?: string;
};

type ToneStats = { brightness: number; contrast: number };

function isCurrentEngine(engine?: string | null) {
  return Boolean(engine) && engine === CLEANUP_ENGINE;
}

/** Normalize DB/API preset; missing/legacy empty string counts as Auto. */
function storedPreset(photo: CleanupPhoto): CleanupPreset {
  return isCleanupPreset(photo.cleanupPreviewPreset)
    ? photo.cleanupPreviewPreset
    : "auto";
}

function presetForPhoto(
  photo: CleanupPhoto,
  draft: Record<string, CleanupPreset>,
): CleanupPreset {
  if (draft[photo.id]) return draft[photo.id];
  return storedPreset(photo);
}

/**
 * Separate sandbox to judge lighting/sharpness cleanup on Needs editing photos.
 * Per-photo presets: Auto / Gentle / Dark lift / Sharpen.
 * Originals stay untouched until “Use this version”.
 */
export function CleanupPreviewPanel({
  photos,
  onMessage,
  onPhotoUpdated,
}: {
  photos: CleanupPhoto[];
  onMessage: (message: string) => void;
  onPhotoUpdated: (
    id: string,
    patch: {
      hasCleanupPreview?: boolean;
      cleanupPreviewUrl?: string | null;
      cleanupPreviewEngine?: string;
      cleanupPreviewPreset?: string;
      url?: string;
    },
  ) => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [statsById, setStatsById] = useState<
    Record<string, { before: ToneStats; after: ToneStats; engine: string; preset: CleanupPreset }>
  >({});
  const [presetDraft, setPresetDraft] = useState<Record<string, CleanupPreset>>({});
  const [batchBusy, setBatchBusy] = useState(false);
  const [defaultPreset, setDefaultPreset] = useState<CleanupPreset>("auto");

  const comparePhoto = useMemo(
    () => photos.find((p) => p.id === compareId) || null,
    [photos, compareId],
  );

  const pendingCount = photos.filter(
    (p) => !p.hasCleanupPreview || !isCurrentEngine(p.cleanupPreviewEngine),
  ).length;
  const previewCount = photos.filter((p) =>
    Boolean(p.hasCleanupPreview && isCurrentEngine(p.cleanupPreviewEngine)),
  ).length;
  const outdatedCount = photos.filter(
    (p) => p.hasCleanupPreview && !isCurrentEngine(p.cleanupPreviewEngine),
  ).length;

  function setPhotoPreset(mediaId: string, preset: CleanupPreset) {
    setPresetDraft((prev) => ({ ...prev, [mediaId]: preset }));
  }

  async function runAction(
    mediaId: string,
    action: "generate" | "apply" | "discard",
    presetOverride?: CleanupPreset,
  ) {
    setBusyId(mediaId);
    const photo = photos.find((p) => p.id === mediaId);
    const preset =
      presetOverride ||
      (photo ? presetForPhoto(photo, presetDraft) : defaultPreset);

    try {
      const res = await fetch("/api/uploader/media/cleanup-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaId,
          action,
          ...(action === "generate" ? { preset } : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 401) {
        window.location.assign("/upload/login");
        return;
      }
      if (!res.ok) {
        onMessage(json.error || "Cleanup action failed.");
        return;
      }

      if (action === "generate") {
        const usedPreset: CleanupPreset = isCleanupPreset(json.preset) ? json.preset : preset;
        onPhotoUpdated(mediaId, {
          hasCleanupPreview: true,
          cleanupPreviewUrl: json.cleanupPreviewUrl,
          cleanupPreviewEngine: json.engine || CLEANUP_ENGINE,
          cleanupPreviewPreset: usedPreset,
        });
        setPresetDraft((prev) => ({ ...prev, [mediaId]: usedPreset }));
        if (json.before && json.after) {
          setStatsById((prev) => ({
            ...prev,
            [mediaId]: {
              before: json.before,
              after: json.after,
              engine: json.engine || CLEANUP_ENGINE,
              preset: usedPreset,
            },
          }));
          const lift = Math.round((json.after.brightness - json.before.brightness) * 10) / 10;
          onMessage(
            `${CLEANUP_PRESET_LABELS[usedPreset]} preview ready (brightness ${json.before.brightness} → ${json.after.brightness}${
              lift > 0 ? `, +${lift}` : ""
            }). Original unchanged — compare, then Use or try another tweak.`,
          );
        } else {
          onMessage("Cleanup preview ready — original is unchanged. Compare before you use it.");
        }
        setCompareId(mediaId);
      } else if (action === "discard") {
        onPhotoUpdated(mediaId, {
          hasCleanupPreview: false,
          cleanupPreviewUrl: null,
          cleanupPreviewEngine: "",
          cleanupPreviewPreset: "",
        });
        setStatsById((prev) => {
          const next = { ...prev };
          delete next[mediaId];
          return next;
        });
        if (compareId === mediaId) setCompareId(null);
        onMessage("Discarded cleanup preview. Original kept.");
      } else if (action === "apply") {
        onPhotoUpdated(mediaId, {
          hasCleanupPreview: false,
          cleanupPreviewUrl: null,
          cleanupPreviewEngine: "",
          cleanupPreviewPreset: "",
          url: json.url || undefined,
        });
        setStatsById((prev) => {
          const next = { ...prev };
          delete next[mediaId];
          return next;
        });
        if (compareId === mediaId) setCompareId(null);
        onMessage("Applied cleanup to this photo. It’s still in Needs editing until you mark ready.");
      }
    } catch {
      onMessage("Cleanup action failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function runBatch(limit = 8) {
    const targets = photos
      .filter((p) => !p.hasCleanupPreview || !isCurrentEngine(p.cleanupPreviewEngine))
      .slice(0, limit);
    if (!targets.length) {
      onMessage("Every loaded Needs editing photo already has a current cleanup preview.");
      return;
    }
    setBatchBusy(true);
    onMessage(
      `Running ${CLEANUP_PRESET_LABELS[defaultPreset]} cleanup on ${targets.length} photo${
        targets.length === 1 ? "" : "s"
      }…`,
    );
    let done = 0;
    for (const photo of targets) {
      setBusyId(photo.id);
      const preset = presetForPhoto(photo, presetDraft) || defaultPreset;
      try {
        const res = await fetch("/api/uploader/media/cleanup-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mediaId: photo.id, action: "generate", preset }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          onMessage(json.error || `Stopped after ${done} — could not clean ${photo.title}.`);
          break;
        }
        const usedPreset: CleanupPreset = isCleanupPreset(json.preset) ? json.preset : preset;
        onPhotoUpdated(photo.id, {
          hasCleanupPreview: true,
          cleanupPreviewUrl: json.cleanupPreviewUrl,
          cleanupPreviewEngine: json.engine || CLEANUP_ENGINE,
          cleanupPreviewPreset: usedPreset,
        });
        if (json.before && json.after) {
          setStatsById((prev) => ({
            ...prev,
            [photo.id]: {
              before: json.before,
              after: json.after,
              engine: json.engine || CLEANUP_ENGINE,
              preset: usedPreset,
            },
          }));
        }
        done += 1;
      } catch {
        onMessage(`Stopped after ${done} — network error.`);
        break;
      }
    }
    setBusyId(null);
    setBatchBusy(false);
    if (done > 0) {
      onMessage(
        `Created ${done} cleanup preview${done === 1 ? "" : "s"}. Change a photo’s tweak and Re-run if it needs a different pass.`,
      );
    }
  }

  if (photos.length === 0) {
    return (
      <div className="mt-4 rounded-xl border border-[color:var(--line)] bg-white p-4 text-sm text-pine">
        Nothing in Needs editing to preview. Move soft or dark shots there first, then come back.
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-xl border border-[color:var(--line)] bg-mist/40 px-4 py-3">
        <p className="text-sm font-medium text-ink">Cleanup preview (sandbox)</p>
        <p className="mt-1 text-sm text-pine">
          Different shots need different help. Pick a tweak per photo —{" "}
          <span className="font-medium text-ink">Auto</span>,{" "}
          <span className="font-medium text-ink">Gentle</span>,{" "}
          <span className="font-medium text-ink">Dark lift</span>, or{" "}
          <span className="font-medium text-ink">Sharpen</span> — then Run. Lighting/sharpen only;
          faces stay put. Originals unchanged until{" "}
          <span className="font-medium text-ink">Use this version</span>.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-pine">
            Batch default
            <select
              value={defaultPreset}
              onChange={(e) => {
                const value = e.target.value;
                if (isCleanupPreset(value)) setDefaultPreset(value);
              }}
              className="h-9 rounded-lg border border-[color:var(--line)] bg-white px-2 text-sm text-ink"
            >
              {CLEANUP_PRESETS.map((preset) => (
                <option key={preset} value={preset}>
                  {CLEANUP_PRESET_LABELS[preset]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={batchBusy || pendingCount === 0}
            onClick={() => {
              // Apply batch default to pending photos that have no draft yet.
              setPresetDraft((prev) => {
                const next = { ...prev };
                for (const photo of photos) {
                  if (!photo.hasCleanupPreview || !isCurrentEngine(photo.cleanupPreviewEngine)) {
                    if (!next[photo.id]) next[photo.id] = defaultPreset;
                  }
                }
                return next;
              });
              void runBatch(8);
            }}
            className="inline-flex h-10 items-center rounded-lg bg-ink px-4 text-sm font-medium text-foam disabled:opacity-50"
          >
            {batchBusy
              ? "Running…"
              : pendingCount === 0
                ? "All loaded photos have current previews"
                : `Preview next ${Math.min(8, pendingCount)}`}
          </button>
          <span className="text-xs text-pine">
            {previewCount} current · {pendingCount} need run
            {outdatedCount ? ` (${outdatedCount} outdated)` : ""}
          </span>
        </div>
        <p className="mt-2 text-xs text-pine">{CLEANUP_PRESET_HINTS[defaultPreset]}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {photos.map((photo) => {
          const busy = busyId === photo.id || batchBusy;
          const stats = statsById[photo.id];
          const preset = presetForPhoto(photo, presetDraft);
          const lastPreset = storedPreset(photo);
          const outdated =
            Boolean(photo.hasCleanupPreview) && !isCurrentEngine(photo.cleanupPreviewEngine);
          const presetDirty =
            Boolean(photo.hasCleanupPreview) && preset !== lastPreset;
          const emphasizeRun = outdated || presetDirty;
          const previewSrc = photo.cleanupPreviewUrl
            ? `${photo.cleanupPreviewUrl}${photo.cleanupPreviewUrl.includes("?") ? "&" : "?"}v=${encodeURIComponent(
                `${photo.cleanupPreviewEngine || "1"}-${lastPreset}`,
              )}`
            : null;
          return (
            <div
              key={photo.id}
              className="overflow-hidden rounded-lg border border-[color:var(--line)] bg-white"
            >
              <div className="grid grid-cols-2 gap-px bg-[color:var(--line)]">
                <div className="relative bg-mist">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt={`Original ${photo.title}`}
                    className="aspect-square w-full object-cover"
                    loading="lazy"
                  />
                  <span className="absolute left-1.5 top-1.5 rounded bg-ink/80 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-foam">
                    Original
                  </span>
                </div>
                <div className="relative bg-mist">
                  {photo.hasCleanupPreview && previewSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={previewSrc}
                      alt={`Cleanup ${photo.title}`}
                      className="aspect-square w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex aspect-square items-center justify-center px-3 text-center text-xs text-pine">
                      No cleanup preview yet
                    </div>
                  )}
                  <span className="absolute left-1.5 top-1.5 rounded bg-ink/80 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-foam">
                    Cleanup
                  </span>
                </div>
              </div>
              <div className="space-y-2 p-3">
                <p className="truncate text-sm text-ink">
                  {photo.taggedNames?.length
                    ? photo.taggedNames.join(", ")
                    : photo.title}
                </p>

                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Cleanup tweak">
                  {CLEANUP_PRESETS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      disabled={busy}
                      aria-pressed={preset === option}
                      title={CLEANUP_PRESET_HINTS[option]}
                      onClick={() => setPhotoPreset(photo.id, option)}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                        preset === option ? "bg-ink text-foam" : "bg-mist text-pine"
                      } disabled:opacity-50`}
                    >
                      {CLEANUP_PRESET_LABELS[option]}
                    </button>
                  ))}
                </div>

                {outdated ? (
                  <p className="text-xs text-gold-deep">
                    Older pass — pick a tweak and Re-run cleanup.
                  </p>
                ) : photo.hasCleanupPreview ? (
                  <p className="text-xs text-pine">
                    Last run: {CLEANUP_PRESET_LABELS[lastPreset]}
                    {presetDirty
                      ? ` · selected ${CLEANUP_PRESET_LABELS[preset]} (not run yet)`
                      : ""}
                  </p>
                ) : null}

                {stats ? (
                  <p className="text-xs text-pine">
                    Brightness {stats.before.brightness} → {stats.after.brightness} · Contrast{" "}
                    {stats.before.contrast} → {stats.after.contrast}
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void runAction(photo.id, "generate", preset)}
                    className={
                      emphasizeRun
                        ? "rounded-lg border border-[color:var(--line)] bg-ink px-3 py-1.5 text-xs text-foam hover:bg-pine disabled:opacity-50"
                        : "rounded-lg border border-[color:var(--line)] px-3 py-1.5 text-xs text-ink hover:bg-mist disabled:opacity-50"
                    }
                  >
                    {busy && busyId === photo.id
                      ? "Working…"
                      : photo.hasCleanupPreview
                        ? `Re-run · ${CLEANUP_PRESET_LABELS[preset]}`
                        : `Run · ${CLEANUP_PRESET_LABELS[preset]}`}
                  </button>
                  {photo.hasCleanupPreview ? (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setCompareId(photo.id)}
                        className="rounded-lg border border-[color:var(--line)] px-3 py-1.5 text-xs text-ink hover:bg-mist disabled:opacity-50"
                      >
                        Compare larger
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void runAction(photo.id, "apply")}
                        className="rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-foam disabled:opacity-50"
                      >
                        Use this version
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void runAction(photo.id, "discard")}
                        className="rounded-lg px-3 py-1.5 text-xs text-pine hover:text-ink disabled:opacity-50"
                      >
                        Discard preview
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {comparePhoto?.hasCleanupPreview && comparePhoto.cleanupPreviewUrl ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Compare original and cleanup"
          onClick={() => setCompareId(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-5xl overflow-auto rounded-xl bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-[family-name:var(--font-fraunces)] text-xl text-ink">
                  Compare cleanup
                </p>
                <p className="text-sm text-pine">
                  Tweak: {CLEANUP_PRESET_LABELS[storedPreset(comparePhoto)]}.
                  Lighting & sharpness only — if faces look different, discard.
                  {!isCurrentEngine(comparePhoto.cleanupPreviewEngine)
                    ? " Older mild pass — pick a tweak and Re-run."
                    : ""}
                </p>
                {statsById[comparePhoto.id] ? (
                  <p className="mt-1 text-xs text-pine">
                    Brightness {statsById[comparePhoto.id].before.brightness} →{" "}
                    {statsById[comparePhoto.id].after.brightness} · Contrast{" "}
                    {statsById[comparePhoto.id].before.contrast} →{" "}
                    {statsById[comparePhoto.id].after.contrast}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setCompareId(null)}
                className="rounded-lg border border-[color:var(--line)] px-3 py-1.5 text-sm text-ink hover:bg-mist"
              >
                Close
              </button>
            </div>

            <div className="mb-3 flex flex-wrap gap-1.5">
              {CLEANUP_PRESETS.map((option) => (
                <button
                  key={option}
                  type="button"
                  disabled={busyId === comparePhoto.id}
                  aria-pressed={presetForPhoto(comparePhoto, presetDraft) === option}
                  onClick={() => setPhotoPreset(comparePhoto.id, option)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    presetForPhoto(comparePhoto, presetDraft) === option
                      ? "bg-ink text-foam"
                      : "bg-mist text-pine"
                  } disabled:opacity-50`}
                >
                  {CLEANUP_PRESET_LABELS[option]}
                </button>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <figure>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={comparePhoto.url}
                  alt="Original"
                  className="w-full rounded-lg object-contain"
                />
                <figcaption className="mt-1 text-center text-xs font-medium uppercase tracking-wide text-pine">
                  Original
                </figcaption>
              </figure>
              <figure>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${comparePhoto.cleanupPreviewUrl}${
                    comparePhoto.cleanupPreviewUrl.includes("?") ? "&" : "?"
                  }v=${encodeURIComponent(
                    `${comparePhoto.cleanupPreviewEngine || CLEANUP_ENGINE}-${storedPreset(comparePhoto)}`,
                  )}`}
                  alt="Cleanup preview"
                  className="w-full rounded-lg object-contain"
                />
                <figcaption className="mt-1 text-center text-xs font-medium uppercase tracking-wide text-pine">
                  Cleanup preview
                </figcaption>
              </figure>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busyId === comparePhoto.id}
                onClick={() =>
                  void runAction(
                    comparePhoto.id,
                    "generate",
                    presetForPhoto(comparePhoto, presetDraft),
                  )
                }
                className="rounded-lg border border-[color:var(--line)] px-4 py-2 text-sm text-ink hover:bg-mist disabled:opacity-50"
              >
                Re-run · {CLEANUP_PRESET_LABELS[presetForPhoto(comparePhoto, presetDraft)]}
              </button>
              {isCurrentEngine(comparePhoto.cleanupPreviewEngine) ? (
                <button
                  type="button"
                  disabled={busyId === comparePhoto.id}
                  onClick={() => void runAction(comparePhoto.id, "apply")}
                  className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-foam disabled:opacity-50"
                >
                  Use this version
                </button>
              ) : null}
              <button
                type="button"
                disabled={busyId === comparePhoto.id}
                onClick={() => void runAction(comparePhoto.id, "discard")}
                className="rounded-lg border border-[color:var(--line)] px-4 py-2 text-sm text-ink hover:bg-mist disabled:opacity-50"
              >
                Discard preview
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
