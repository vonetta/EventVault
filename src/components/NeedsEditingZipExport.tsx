"use client";

import { useEffect, useRef, useState } from "react";

type Phase = "idle" | "checking" | "started" | "error";

type MetaResponse = {
  photoCount: number;
  estimatedBytes: number;
  filename: string;
  capped: boolean;
  maxFiles: number;
  error?: string;
};

function formatBytes(bytes: number) {
  if (!bytes || bytes < 0) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
}

/**
 * Export strip for the Needs editing pile — primary CTA, live status, and a
 * browser-native download so hundreds of stills stream to disk (not into a blob).
 */
export function NeedsEditingZipExport({
  eventId,
  photoCount,
  onMessage,
  loginPath = "/upload/login",
  className = "",
}: {
  eventId: string;
  photoCount: number;
  onMessage?: (message: string) => void;
  /** Where to send a 401 (admin vs uploader). */
  loginPath?: string;
  className?: string;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState("");
  const [detail, setDetail] = useState("");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, []);

  function scheduleIdle(delayMs = 12_000) {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => {
      setPhase("idle");
      setStatus("");
      setDetail("");
    }, delayMs);
  }

  async function startDownload() {
    if (!eventId || photoCount <= 0 || phase === "checking" || phase === "started") return;

    setPhase("checking");
    setStatus("Checking the Needs editing pile…");
    setDetail("This can take a minute when there are hundreds of photos.");
    onMessage?.("Checking Needs editing before download…");

    try {
      const metaUrl = `/api/uploader/media/download-editing?eventId=${encodeURIComponent(eventId)}&meta=1`;
      const metaRes = await fetch(metaUrl);
      if (metaRes.status === 401) {
        window.location.assign(loginPath);
        return;
      }
      const meta = (await metaRes.json().catch(() => ({}))) as MetaResponse;
      if (!metaRes.ok) {
        const error = meta.error || "Could not prepare the Needs editing ZIP.";
        setPhase("error");
        setStatus(error);
        setDetail("Try again in a moment, or refresh the page.");
        onMessage?.(error);
        scheduleIdle(8_000);
        return;
      }

      const sizeLabel = formatBytes(meta.estimatedBytes);
      const count = meta.photoCount || photoCount;
      const cappedNote = meta.capped
        ? ` First ${meta.maxFiles.toLocaleString()} photos only.`
        : "";

      setPhase("started");
      setStatus(
        `Downloading ${count.toLocaleString()} photo${count === 1 ? "" : "s"}${
          sizeLabel ? ` (~${sizeLabel})` : ""
        }…`,
      );
      setDetail(
        `Your browser is saving ${meta.filename || "needs-editing.zip"}.${cappedNote} Keep this tab open until the download finishes.`,
      );
      onMessage?.(
        `Downloading ${count.toLocaleString()} Needs editing photo${count === 1 ? "" : "s"}…`,
      );

      // Browser-native stream-to-disk (avoids loading a huge ZIP into memory).
      const zipUrl = `/api/uploader/media/download-editing?eventId=${encodeURIComponent(eventId)}`;
      const anchor = document.createElement("a");
      anchor.href = zipUrl;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      scheduleIdle(20_000);
    } catch {
      setPhase("error");
      setStatus("Could not start the Needs editing ZIP.");
      setDetail("Check your connection and try again.");
      onMessage?.("Could not start the Needs editing ZIP.");
      scheduleIdle(8_000);
    }
  }

  if (photoCount <= 0) return null;

  const busy = phase === "checking" || phase === "started";
  const sizeHint =
    photoCount >= 50
      ? "Built for large piles — your browser downloads straight to disk."
      : "One ZIP for offline edit work.";

  return (
    <div
      className={`rounded-xl border border-[color:var(--line)] bg-mist/50 px-4 py-3 ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-xl">
          <p className="text-sm font-medium text-ink">Download for offline edit</p>
          <p className="mt-0.5 text-sm text-pine">
            {photoCount.toLocaleString()} photo{photoCount === 1 ? "" : "s"} in Needs editing.{" "}
            {sizeHint}
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void startDownload()}
          aria-busy={busy}
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-ink px-4 text-sm font-medium text-foam transition hover:bg-pine disabled:cursor-not-allowed disabled:opacity-50"
        >
          {phase === "checking"
            ? "Checking…"
            : phase === "started"
              ? "Download started…"
              : `Download all ${photoCount.toLocaleString()}`}
        </button>
      </div>

      {busy ? (
        <div className="mt-3" aria-hidden>
          <div className="h-1.5 overflow-hidden rounded-full bg-white">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-ink/70" />
          </div>
        </div>
      ) : null}

      <p
        role="status"
        aria-live="polite"
        className={`mt-2 text-sm ${
          phase === "error" ? "text-red-700" : status ? "text-pine" : "sr-only"
        }`}
      >
        {status || "Ready to download Needs editing photos."}
        {detail ? <span className="mt-0.5 block text-xs text-pine">{detail}</span> : null}
      </p>
    </div>
  );
}
