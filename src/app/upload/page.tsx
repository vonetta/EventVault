"use client";

import { useEffect, useRef, useState } from "react";
import { formatFileSize, resizeImageForUpload } from "@/lib/resize-image";

type EventOption = { _id: string; name: string };

type UploadStatus = "pending" | "working" | "done" | "error";
type UploadItem = {
  id: string;
  file: File;
  name: string;
  size: number;
  status: UploadStatus;
  message?: string;
};

type StagedPhoto = {
  id: string;
  title: string;
  url: string;
  uploadedByName?: string;
};

export default function UploadPage() {
  const [events, setEvents] = useState<EventOption[] | null>(null);
  const [eventId, setEventId] = useState("");
  const [items, setItems] = useState<UploadItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [mainGallery, setMainGallery] = useState<StagedPhoto[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await fetch("/api/uploader/events");
      if (!active) return;
      if (res.status === 401) {
        window.location.assign("/upload/login");
        return;
      }
      if (!res.ok) {
        setLoadError("Could not load events. Try refreshing.");
        return;
      }
      const data = (await res.json()) as { events: EventOption[] };
      if (!active) return;
      setEvents(data.events);
      setEventId((current) => current || data.events[0]?._id || "");
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!eventId) return;
    let active = true;
    (async () => {
      const res = await fetch(`/api/uploader/media?eventId=${encodeURIComponent(eventId)}`);
      if (!active) return;
      if (res.status === 401) {
        window.location.assign("/upload/login");
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as { media: StagedPhoto[] };
      if (!active) return;
      setMainGallery(data.media);
    })();
    return () => {
      active = false;
    };
  }, [eventId]);

  async function refreshMainGallery() {
    if (!eventId) return;
    const res = await fetch(`/api/uploader/media?eventId=${encodeURIComponent(eventId)}`);
    if (!res.ok) return;
    const data = (await res.json()) as { media: StagedPhoto[] };
    setMainGallery(data.media);
  }

  function addFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const next: UploadItem[] = Array.from(fileList).map((file) => ({
      id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
      file,
      name: file.name,
      size: file.size,
      status: "pending",
    }));
    setItems((prev) => [...prev, ...next]);
    setMessage("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function updateItem(id: string, patch: Partial<UploadItem>) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  async function uploadAll() {
    if (!eventId) {
      setMessage("Pick an event first.");
      return;
    }
    const queue = items.filter((item) => item.status === "pending" || item.status === "error");
    if (queue.length === 0) return;

    setBusy(true);
    let uploaded = 0;

    for (const item of queue) {
      updateItem(item.id, { status: "working", message: "Preparing…" });

      let toSend: File = item.file;
      if (item.file.type.startsWith("image/")) {
        try {
          setPreparing(true);
          toSend = await resizeImageForUpload(item.file);
        } catch {
          toSend = item.file;
        } finally {
          setPreparing(false);
        }
      }

      updateItem(item.id, { message: "Uploading…" });
      const form = new FormData();
      form.set("file", toSend);
      form.set("eventId", eventId);
      form.set("kind", "team_photo");
      form.set("title", item.name);

      try {
        const res = await fetch("/api/uploader/upload", { method: "POST", body: form });
        if (res.status === 401) {
          window.location.assign("/upload/login");
          return;
        }
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          updateItem(item.id, { status: "error", message: json.error || "Upload failed" });
        } else {
          uploaded += 1;
          updateItem(item.id, { status: "done", message: "Uploaded" });
        }
      } catch {
        updateItem(item.id, { status: "error", message: "Network error" });
      }
    }

    setBusy(false);
    setMessage(uploaded ? `Uploaded ${uploaded} photo${uploaded === 1 ? "" : "s"} to the event.` : "");
    await refreshMainGallery();
  }

  async function deletePhoto(id: string) {
    if (!confirm("Delete this photo? This can't be undone.")) return;
    const res = await fetch("/api/uploader/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mediaId: id }),
    });
    if (res.status === 401) {
      window.location.assign("/upload/login");
      return;
    }
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setMessage(json.error || "Could not delete that photo.");
      return;
    }
    setMainGallery((prev) => prev.filter((photo) => photo.id !== id));
  }

  async function signOut() {
    await fetch("/api/auth/uploader/logout", { method: "POST" });
    window.location.assign("/upload/login");
  }

  const pendingCount = items.filter(
    (item) => item.status === "pending" || item.status === "error",
  ).length;

  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-2xl px-6 py-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="font-[family-name:var(--font-fraunces)] text-2xl text-ink">EventVault</p>
          <h1 className="mt-1 font-[family-name:var(--font-fraunces)] text-3xl text-ink">
            Team photo upload
          </h1>
          <p className="mt-1 text-sm text-pine">
            Add photos to an event. They go to the event admin to review and share — guests don’t
            see them until the admin sends them out.
          </p>
        </div>
        <button
          type="button"
          onClick={signOut}
          className="shrink-0 rounded-lg border border-[color:var(--line)] px-3 py-2 text-sm text-pine hover:text-ink"
        >
          Sign out
        </button>
      </header>

      {loadError ? <p className="mt-6 text-sm text-red-700">{loadError}</p> : null}

      {events && events.length === 0 ? (
        <p className="mt-8 rounded-xl border border-[color:var(--line)] bg-white p-4 text-sm text-pine">
          No events exist yet. Ask an admin to create one, then refresh this page.
        </p>
      ) : (
        <div className="mt-8 space-y-6">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-[0.08em] text-pine">Event</span>
            <select
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
              className="h-11 w-full rounded-lg border border-[color:var(--line)] bg-white px-3 text-ink outline-none focus-visible:border-ink"
            >
              {(events ?? []).map((event) => (
                <option key={event._id} value={event._id}>
                  {event.name}
                </option>
              ))}
            </select>
          </label>

          <input
            ref={fileInputRef}
            id="uploader-file-input"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            onChange={(e) => addFiles(e.target.files)}
            className="sr-only"
          />
          <label
            htmlFor="uploader-file-input"
            className="flex min-h-[9rem] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[color:var(--line)] bg-white px-4 py-6 text-center transition hover:border-ink/30"
          >
            <span className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-foam">
              Choose photos
            </span>
            <span className="text-sm text-pine">
              JPEG, PNG, WebP, or GIF · you can pick several · large photos are auto-resized
            </span>
          </label>

          {items.length > 0 ? (
            <ul className="space-y-2">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[color:var(--line)] bg-white px-3 py-2 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate text-ink">{item.name}</span>
                  <span className="shrink-0 text-xs text-pine">{formatFileSize(item.size)}</span>
                  <span
                    className={`shrink-0 text-xs font-medium ${
                      item.status === "error"
                        ? "text-red-700"
                        : item.status === "done"
                          ? "text-pine"
                          : "text-gold-deep"
                    }`}
                  >
                    {item.status === "pending"
                      ? "Ready"
                      : item.status === "working"
                        ? item.message || "Working…"
                        : item.status === "done"
                          ? "Uploaded"
                          : item.message || "Failed"}
                  </span>
                  {!busy && item.status !== "done" ? (
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="shrink-0 text-xs text-pine underline"
                    >
                      Remove
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={uploadAll}
              disabled={busy || preparing || pendingCount === 0 || !eventId}
              className="inline-flex h-11 items-center justify-center rounded-lg bg-ink px-5 text-sm font-medium text-foam transition hover:bg-pine disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy
                ? "Uploading…"
                : pendingCount > 0
                  ? `Upload ${pendingCount} photo${pendingCount === 1 ? "" : "s"}`
                  : "Choose photos to upload"}
            </button>
          </div>

          {message ? <p className="text-sm text-pine">{message}</p> : null}

          <section className="border-t border-[color:var(--line)] pt-6">
            <h2 className="font-[family-name:var(--font-fraunces)] text-xl text-ink">
              Main gallery
              {mainGallery.length ? (
                <span className="ml-2 text-base text-pine">{mainGallery.length}</span>
              ) : null}
            </h2>
            <p className="mt-1 text-sm text-pine">
              Photos waiting for the admin to review. You can delete ones you didn’t mean to upload.
            </p>
            {mainGallery.length === 0 ? (
              <p className="mt-4 text-sm text-pine">Nothing here yet.</p>
            ) : (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {mainGallery.map((photo) => (
                  <div
                    key={photo.id}
                    className="relative overflow-hidden rounded-lg border border-[color:var(--line)] bg-white"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.url}
                      alt={photo.title}
                      className="aspect-square w-full object-cover"
                      loading="lazy"
                    />
                    <button
                      type="button"
                      onClick={() => deletePhoto(photo.id)}
                      className="absolute right-1.5 top-1.5 rounded-full bg-ink/80 px-2 py-1 text-xs text-foam"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
