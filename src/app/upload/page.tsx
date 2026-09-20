"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaceAssistPanel } from "@/components/FaceAssistPanel";
import { GuestTagPicker } from "@/components/GuestTagPicker";
import type { NameOnlyGuest } from "@/lib/guest-name-match";
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
  needsEditing: boolean;
  taggedGuestIds: string[];
  taggedNames: string[];
};

type GalleryBucket = "ready" | "editing";

export default function UploadPage() {
  const [events, setEvents] = useState<EventOption[] | null>(null);
  const [eventId, setEventId] = useState("");
  const [items, setItems] = useState<UploadItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [readyGallery, setReadyGallery] = useState<StagedPhoto[]>([]);
  const [editingGallery, setEditingGallery] = useState<StagedPhoto[]>([]);
  const [guests, setGuests] = useState<NameOnlyGuest[]>([]);
  const [markNeedsEditing, setMarkNeedsEditing] = useState(false);
  const [bucket, setBucket] = useState<GalleryBucket>("ready");
  const [taggingId, setTaggingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadGuests = useCallback(async (id: string) => {
    const res = await fetch(`/api/uploader/guests?eventId=${encodeURIComponent(id)}`);
    if (!res.ok) return;
    const data = (await res.json()) as { guests: NameOnlyGuest[] };
    setGuests(data.guests);
  }, []);

  const refreshGalleries = useCallback(async (id: string) => {
    const res = await fetch(`/api/uploader/media?eventId=${encodeURIComponent(id)}`);
    if (res.status === 401) {
      window.location.assign("/upload/login");
      return;
    }
    if (!res.ok) return;
    const data = (await res.json()) as {
      media: StagedPhoto[];
      needsEditing: StagedPhoto[];
    };
    setReadyGallery(data.media || []);
    setEditingGallery(data.needsEditing || []);
  }, []);

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
      await Promise.all([refreshGalleries(eventId), loadGuests(eventId)]);
      if (!active) return;
    })();
    return () => {
      active = false;
    };
  }, [eventId, refreshGalleries, loadGuests]);

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
      if (markNeedsEditing) form.set("needsEditing", "true");

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
    setMessage(
      uploaded
        ? `Uploaded ${uploaded} photo${uploaded === 1 ? "" : "s"}${
            markNeedsEditing ? " to Needs editing" : " to the Main gallery"
          }.`
        : "",
    );
    if (markNeedsEditing) setBucket("editing");
    await refreshGalleries(eventId);
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
    setReadyGallery((prev) => prev.filter((photo) => photo.id !== id));
    setEditingGallery((prev) => prev.filter((photo) => photo.id !== id));
    if (taggingId === id) setTaggingId(null);
  }

  async function updatePhoto(
    id: string,
    patch: { taggedGuestIds?: string[]; needsEditing?: boolean },
  ) {
    setSavingId(id);
    const res = await fetch("/api/uploader/media/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mediaId: id, ...patch }),
    });
    setSavingId(null);
    if (res.status === 401) {
      window.location.assign("/upload/login");
      return;
    }
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setMessage(json.error || "Could not update that photo.");
      return;
    }
    await refreshGalleries(eventId);
  }

  async function createGuest(name: string): Promise<NameOnlyGuest | null> {
    const res = await fetch("/api/uploader/guests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, name }),
    });
    if (res.status === 401) {
      window.location.assign("/upload/login");
      return null;
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(json.error || "Could not create that name.");
      return null;
    }
    const guest = json.guest as NameOnlyGuest;
    setGuests((prev) => {
      if (prev.some((g) => g._id === guest._id)) return prev;
      return [...prev, guest].sort((a, b) => a.name.localeCompare(b.name));
    });
    return guest;
  }

  async function signOut() {
    await fetch("/api/auth/uploader/logout", { method: "POST" });
    window.location.assign("/upload/login");
  }

  const pendingCount = items.filter(
    (item) => item.status === "pending" || item.status === "error",
  ).length;

  const activeGallery = bucket === "ready" ? readyGallery : editingGallery;
  const allPhotos = useMemo(
    () => [...readyGallery, ...editingGallery],
    [readyGallery, editingGallery],
  );

  function renderPhotoCard(photo: StagedPhoto) {
    const isTagging = taggingId === photo.id;
    return (
      <div
        key={photo.id}
        className="overflow-hidden rounded-lg border border-[color:var(--line)] bg-white"
      >
        <div className="relative">
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
        <div className="space-y-2 p-2.5">
          <p className="truncate text-xs text-pine">
            {photo.taggedNames.length
              ? photo.taggedNames.join(", ")
              : "No one tagged"}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setTaggingId(isTagging ? null : photo.id)}
              className="rounded-md border border-[color:var(--line)] px-2 py-1 text-xs text-ink hover:bg-mist"
            >
              {isTagging ? "Close tags" : "Tag people"}
            </button>
            <button
              type="button"
              disabled={savingId === photo.id}
              onClick={() =>
                void updatePhoto(photo.id, { needsEditing: !photo.needsEditing })
              }
              className="rounded-md border border-[color:var(--line)] px-2 py-1 text-xs text-ink hover:bg-mist disabled:opacity-50"
            >
              {photo.needsEditing ? "Mark ready" : "Needs editing"}
            </button>
          </div>
          {isTagging ? (
            <GuestTagPicker
              compact
              guests={guests}
              selectedIds={photo.taggedGuestIds}
              disabled={savingId === photo.id}
              onChange={(ids) => void updatePhoto(photo.id, { taggedGuestIds: ids })}
              onCreateGuest={createGuest}
            />
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-3xl px-6 py-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="font-[family-name:var(--font-fraunces)] text-2xl text-ink">EventVault</p>
          <h1 className="mt-1 font-[family-name:var(--font-fraunces)] text-3xl text-ink">
            Team photo upload
          </h1>
          <p className="mt-1 text-sm text-pine">
            Upload photos, flag ones that still need editing, and tag guests. Use AI face tagging
            to name people once on a seed photo, then auto-tag the rest of the gallery.
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

          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={markNeedsEditing}
              onChange={(e) => setMarkNeedsEditing(e.target.checked)}
              className="h-4 w-4"
            />
            Mark new uploads as Needs editing (hidden from guests until ready)
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

          {eventId && allPhotos.length > 0 ? (
            <FaceAssistPanel
              eventId={eventId}
              guests={guests}
              photos={allPhotos}
              onCreateGuest={createGuest}
              onGuestsChanged={async () => {
                await loadGuests(eventId);
              }}
              onPhotosChanged={async () => {
                await refreshGalleries(eventId);
              }}
              onMessage={setMessage}
            />
          ) : null}

          <section className="border-t border-[color:var(--line)] pt-6">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setBucket("ready")}
                aria-pressed={bucket === "ready"}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  bucket === "ready" ? "bg-ink text-foam" : "bg-mist text-pine"
                }`}
              >
                Main gallery ({readyGallery.length})
              </button>
              <button
                type="button"
                onClick={() => setBucket("editing")}
                aria-pressed={bucket === "editing"}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  bucket === "editing" ? "bg-ink text-foam" : "bg-mist text-pine"
                }`}
              >
                Needs editing ({editingGallery.length})
              </button>
            </div>
            <p className="mt-2 text-sm text-pine">
              {bucket === "ready"
                ? "Ready for the admin to send to groups, or already tagged for someone’s personal gallery."
                : "Hidden from guests. Tag people here if you like, then mark ready when the edit is done."}
            </p>
            {activeGallery.length === 0 ? (
              <p className="mt-4 text-sm text-pine">Nothing here yet.</p>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {activeGallery.map(renderPhotoCard)}
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
