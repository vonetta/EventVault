"use client";

import { useMemo, useState } from "react";
import { CLEANUP_ENGINE } from "@/lib/cleanup-engine";

export type CleanupPhoto = {
  id: string;
  title: string;
  url: string;
  taggedNames?: string[];
  hasCleanupPreview?: boolean;
  cleanupPreviewUrl?: string | null;
  cleanupPreviewEngine?: string;
};

type ToneStats = { brightness: number; contrast: number };

function isCurrentEngine(engine?: string | null) {
  return Boolean(engine) && engine === CLEANUP_ENGINE;
}

/**
 * Separate sandbox to judge lighting/sharpness cleanup on Needs editing photos.
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
      url?: string;
    },
  ) => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [statsById, setStatsById] = useState<
    Record<string, { before: ToneStats; after: ToneStats; engine: string }>
  >({});
  const [batchBusy, setBatchBusy] = useState(false);

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

  async function runAction(
    mediaId: string,
    action: "generate" | "apply" | "discard",
  ) {
    setBusyId(mediaId);
    try {
      const res = await fetch("/api/uploader/media/cleanup-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaId, action }),
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
        onPhotoUpdated(mediaId, {
          hasCleanupPreview: true,
          cleanupPreviewUrl: json.cleanupPreviewUrl,
          cleanupPreviewEngine: json.engine || CLEANUP_ENGINE,
        });
        if (json.before && json.after) {
          setStatsById((prev) => ({
            ...prev,
            [mediaId]: {
              before: json.before,
              after: json.after,
              engine: json.engine || CLEANUP_ENGINE,
            },
          }));
          const lift = Math.round((json.after.brightness - json.before.brightness) * 10) / 10;
          onMessage(
            `Cleanup preview ready (brightness ${json.before.brightness} → ${json.after.brightness}${
              lift > 0 ? `, +${lift}` : ""
            }). Original unchanged — compare, then Use or Discard.`,
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
    onMessage(`Running cleanup preview on ${targets.length} photo${targets.length === 1 ? "" : "s"}…`);
    let done = 0;
    for (const photo of targets) {
      setBusyId(photo.id);
      try {
        const res = await fetch("/api/uploader/media/cleanup-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mediaId: photo.id, action: "generate" }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          onMessage(json.error || `Stopped after ${done} — could not clean ${photo.title}.`);
          break;
        }
        onPhotoUpdated(photo.id, {
          hasCleanupPreview: true,
          cleanupPreviewUrl: json.cleanupPreviewUrl,
          cleanupPreviewEngine: json.engine || CLEANUP_ENGINE,
        });
        if (json.before && json.after) {
          setStatsById((prev) => ({
            ...prev,
            [photo.id]: {
              before: json.before,
              after: json.after,
              engine: json.engine || CLEANUP_ENGINE,
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
        `Created ${done} cleanup preview${done === 1 ? "" : "s"}. Originals unchanged — open Compare to judge.`,
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
          Lifts dark / flat frames (adaptive lighting + sharpen) — same framing, no face redraw.
          Previews are separate files. Originals stay until you tap{" "}
          <span className="font-medium text-ink">Use this version</span>. If an older preview looks
          unchanged, tap <span className="font-medium text-ink">Re-run cleanup</span>.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={batchBusy || pendingCount === 0}
            onClick={() => void runBatch(8)}
            className="inline-flex h-10 items-center rounded-lg bg-ink px-4 text-sm font-medium text-foam disabled:opacity-50"
          >
            {batchBusy
              ? "Running…"
              : pendingCount === 0
                ? "All loaded photos have current previews"
                : outdatedCount > 0
                  ? `Re-run / preview next ${Math.min(8, pendingCount)}`
                  : `Preview next ${Math.min(8, pendingCount)}`}
          </button>
          <span className="text-xs text-pine">
            {previewCount} current · {pendingCount} need run
            {outdatedCount ? ` (${outdatedCount} outdated)` : ""}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {photos.map((photo) => {
          const busy = busyId === photo.id || batchBusy;
          const stats = statsById[photo.id];
          const outdated =
            Boolean(photo.hasCleanupPreview) && !isCurrentEngine(photo.cleanupPreviewEngine);
          const previewSrc = photo.cleanupPreviewUrl
            ? `${photo.cleanupPreviewUrl}${photo.cleanupPreviewUrl.includes("?") ? "&" : "?"}v=${encodeURIComponent(photo.cleanupPreviewEngine || "1")}`
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
                {outdated ? (
                  <p className="text-xs text-gold-deep">
                    Older mild pass — tap Re-run cleanup to see the stronger lighting lift.
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
                    onClick={() => void runAction(photo.id, "generate")}
                    className={`rounded-lg border border-[color:var(--line)] px-3 py-1.5 text-xs text-ink hover:bg-mist disabled:opacity-50 ${
                      outdated ? "bg-ink text-foam hover:bg-pine" : ""
                    }`}
                  >
                    {busy && busyId === photo.id
                      ? "Working…"
                      : outdated
                        ? "Re-run cleanup"
                        : photo.hasCleanupPreview
                          ? "Re-run cleanup"
                          : "Run cleanup"}
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
                  Lighting & sharpness only. If faces look different, discard — this pass should
                  not redraw people.
                  {!isCurrentEngine(comparePhoto.cleanupPreviewEngine)
                    ? " This preview is from an older mild pass — Re-run cleanup first."
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
                  }v=${encodeURIComponent(comparePhoto.cleanupPreviewEngine || CLEANUP_ENGINE)}`}
                  alt="Cleanup preview"
                  className="w-full rounded-lg object-contain"
                />
                <figcaption className="mt-1 text-center text-xs font-medium uppercase tracking-wide text-pine">
                  Cleanup preview
                </figcaption>
              </figure>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {!isCurrentEngine(comparePhoto.cleanupPreviewEngine) ? (
                <button
                  type="button"
                  disabled={busyId === comparePhoto.id}
                  onClick={() => void runAction(comparePhoto.id, "generate")}
                  className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-foam disabled:opacity-50"
                >
                  Re-run cleanup
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busyId === comparePhoto.id}
                  onClick={() => void runAction(comparePhoto.id, "apply")}
                  className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-foam disabled:opacity-50"
                >
                  Use this version
                </button>
              )}
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
