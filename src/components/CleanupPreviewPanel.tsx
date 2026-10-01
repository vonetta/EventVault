"use client";

import { useMemo, useState } from "react";
import { CLEANUP_ENGINE_AI, CLEANUP_ENGINE_LOCAL } from "@/lib/cleanup-engine";

export type CleanupPhoto = {
  id: string;
  title: string;
  url: string;
  taggedNames?: string[];
  hasCleanupPreview?: boolean;
  cleanupPreviewUrl?: string | null;
  cleanupPreviewEngine?: string;
  /** Plan / AI label from last run (e.g. "AI cleanup · gpt-image-1"). */
  cleanupPreviewPreset?: string;
};

type ToneStats = { brightness: number; contrast: number };

/** Old menu presets stored before adaptive labels — don’t show as “This photo”. */
function isAdaptiveLabel(value?: string | null) {
  if (!value) return false;
  const legacy = new Set(["auto", "gentle", "dark", "soft"]);
  return !legacy.has(value.trim().toLowerCase());
}

/**
 * Sandbox cleanup for Needs editing photos.
 * Uses OpenAI image edit when configured; otherwise local adaptive sharp.
 * Originals stay untouched until “Use this version”.
 */
export function CleanupPreviewPanel({
  photos,
  preferredEngine = CLEANUP_ENGINE_LOCAL,
  aiEnabled = false,
  aiModel = null,
  onMessage,
  onPhotoUpdated,
}: {
  photos: CleanupPhoto[];
  preferredEngine?: string;
  aiEnabled?: boolean;
  aiModel?: string | null;
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
  const currentEngine = preferredEngine || (aiEnabled ? CLEANUP_ENGINE_AI : CLEANUP_ENGINE_LOCAL);
  function isCurrentEngine(engine?: string | null) {
    return Boolean(engine) && engine === currentEngine;
  }
  const [busyId, setBusyId] = useState<string | null>(null);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [statsById, setStatsById] = useState<
    Record<string, { before: ToneStats; after: ToneStats; engine: string; label: string }>
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

  async function runAction(mediaId: string, action: "generate" | "apply" | "discard") {
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
        const label =
          typeof json.label === "string" && json.label
            ? json.label
            : "Adaptive cleanup";
        onPhotoUpdated(mediaId, {
          hasCleanupPreview: true,
          cleanupPreviewUrl: json.cleanupPreviewUrl,
          cleanupPreviewEngine: json.engine || currentEngine,
          cleanupPreviewPreset: label,
        });
        if (json.before && json.after) {
          setStatsById((prev) => ({
            ...prev,
            [mediaId]: {
              before: json.before,
              after: json.after,
              engine: json.engine || currentEngine,
              label,
            },
          }));
          const lift = Math.round((json.after.brightness - json.before.brightness) * 10) / 10;
          onMessage(
            `${label} ready (brightness ${json.before.brightness} → ${json.after.brightness}${
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
      aiEnabled
        ? `Running AI cleanup on ${targets.length} photo${targets.length === 1 ? "" : "s"} (may take a minute each)…`
        : `Running local cleanup on ${targets.length} photo${targets.length === 1 ? "" : "s"}…`,
    );
    let done = 0;
    // AI edits are slow/costly — smaller batches than local.
    const batchLimit = aiEnabled ? Math.min(limit, 3) : limit;
    const batchTargets = targets.slice(0, batchLimit);
    for (const photo of batchTargets) {
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
        const label =
          typeof json.label === "string" && json.label
            ? json.label
            : "Cleanup";
        onPhotoUpdated(photo.id, {
          hasCleanupPreview: true,
          cleanupPreviewUrl: json.cleanupPreviewUrl,
          cleanupPreviewEngine: json.engine || currentEngine,
          cleanupPreviewPreset: label,
        });
        if (json.before && json.after) {
          setStatsById((prev) => ({
            ...prev,
            [photo.id]: {
              before: json.before,
              after: json.after,
              engine: json.engine || currentEngine,
              label,
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
        `Created ${done} cleanup preview${done === 1 ? "" : "s"}. Compare, then Use or Discard.`,
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
          {aiEnabled ? (
            <>
              Uses OpenAI image edit
              {aiModel ? (
                <>
                  {" "}
                  (<span className="font-medium text-ink">{aiModel}</span>)
                </>
              ) : null}{" "}
              — ChatGPT-class lighting/clarity per photo. Prompt asks it to preserve faces and
              framing. Originals stay untouched until{" "}
              <span className="font-medium text-ink">Use this version</span>.
            </>
          ) : (
            <>
              Local adaptive lighting/sharpen (no{" "}
              <span className="font-medium text-ink">OPENAI_API_KEY</span> configured). Add the
              key for ChatGPT-class AI cleanup. Originals stay untouched until{" "}
              <span className="font-medium text-ink">Use this version</span>.
            </>
          )}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={batchBusy || pendingCount === 0}
            onClick={() => void runBatch(aiEnabled ? 3 : 8)}
            className="inline-flex h-10 items-center rounded-lg bg-ink px-4 text-sm font-medium text-foam disabled:opacity-50"
          >
            {batchBusy
              ? "Running…"
              : pendingCount === 0
                ? "All loaded photos have current previews"
                : `Preview next ${Math.min(aiEnabled ? 3 : 8, pendingCount)}`}
          </button>
          <span className="text-xs text-pine">
            {previewCount} current · {pendingCount} need run
            {outdatedCount ? ` (${outdatedCount} outdated)` : ""}
            {aiEnabled ? " · AI" : " · local"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {photos.map((photo) => {
          const busy = busyId === photo.id || batchBusy;
          const stats = statsById[photo.id];
          const outdated =
            Boolean(photo.hasCleanupPreview) && !isCurrentEngine(photo.cleanupPreviewEngine);
          const label = stats?.label || photo.cleanupPreviewPreset || "";
          const previewSrc = photo.cleanupPreviewUrl
            ? `${photo.cleanupPreviewUrl}${photo.cleanupPreviewUrl.includes("?") ? "&" : "?"}v=${encodeURIComponent(
                photo.cleanupPreviewEngine || "1",
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

                {outdated ? (
                  <p className="text-xs text-gold-deep">
                    Older cleanup engine — Re-run for the adaptive pass.
                  </p>
                ) : photo.hasCleanupPreview && isAdaptiveLabel(label) ? (
                  <p className="text-xs text-pine">This photo: {label}</p>
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
                    className={
                      outdated
                        ? "rounded-lg border border-[color:var(--line)] bg-ink px-3 py-1.5 text-xs text-foam hover:bg-pine disabled:opacity-50"
                        : "rounded-lg border border-[color:var(--line)] px-3 py-1.5 text-xs text-ink hover:bg-mist disabled:opacity-50"
                    }
                  >
                    {busy && busyId === photo.id
                      ? "Working…"
                      : photo.hasCleanupPreview
                        ? "Re-run"
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
                  {statsById[comparePhoto.id]?.label ||
                    comparePhoto.cleanupPreviewPreset ||
                    "Adaptive cleanup"}
                  . Lighting & sharpness only — if faces look different, discard.
                  {!isCurrentEngine(comparePhoto.cleanupPreviewEngine)
                    ? " Older pass — Re-run for the current engine."
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
                  }v=${encodeURIComponent(
                    comparePhoto.cleanupPreviewEngine || currentEngine,
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
                onClick={() => void runAction(comparePhoto.id, "generate")}
                className="rounded-lg border border-[color:var(--line)] px-4 py-2 text-sm text-ink hover:bg-mist disabled:opacity-50"
              >
                Re-run
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
