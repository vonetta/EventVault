"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FaceAssistPanel } from "@/components/FaceAssistPanel";
import { GroupPhotoAssistPanel } from "@/components/GroupPhotoAssistPanel";
import { QualityAssistPanel } from "@/components/QualityAssistPanel";
import { TagPhotoModal } from "@/components/TagPhotoModal";
import type { NameOnlyGuest } from "@/lib/guest-name-match";
import { mapPool } from "@/lib/photo-quality";
import { formatFileSize, resizeImageForUpload } from "@/lib/resize-image";

function FixPersonNamePanel({
  guests,
  onRename,
  onMessage,
}: {
  guests: NameOnlyGuest[];
  onRename: (guestId: string, name: string) => Promise<NameOnlyGuest | null>;
  onMessage: (msg: string) => void;
}) {
  const [guestId, setGuestId] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const guest = guests.find((g) => g._id === guestId);
    setName(guest?.name || "");
  }, [guestId, guests]);

  async function save() {
    if (!guestId || !name.trim()) return;
    setSaving(true);
    const guest = await onRename(guestId, name.trim());
    setSaving(false);
    if (guest) {
      onMessage(`Renamed to ${guest.name} on every photo.`);
      setName(guest.name);
    }
  }

  return (
    <section className="rounded-xl border border-ink bg-white p-4">
      <h2 className="font-[family-name:var(--font-fraunces)] text-lg text-ink">
        Fix a person’s name
      </h2>
      <p className="mt-1 text-sm text-pine">
        Pick someone who was tagged with a typo. Saving updates every photo with that tag.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="block min-w-0 flex-1 text-xs font-medium uppercase tracking-wide text-pine">
          Person
          <select
            value={guestId}
            onChange={(e) => setGuestId(e.target.value)}
            className="mt-1 h-10 w-full rounded-lg border border-[color:var(--line)] bg-white px-3 text-sm font-normal normal-case tracking-normal text-ink outline-none focus-visible:border-ink"
          >
            <option value="">Select a name…</option>
            {guests.map((guest) => (
              <option key={guest._id} value={guest._id}>
                {guest.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-0 flex-1 text-xs font-medium uppercase tracking-wide text-pine">
          Correct spelling
          <input
            value={name}
            disabled={!guestId || saving}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void save();
              }
            }}
            className="mt-1 h-10 w-full rounded-lg border border-[color:var(--line)] bg-white px-3 text-sm font-normal normal-case tracking-normal text-ink outline-none focus-visible:border-ink disabled:opacity-50"
          />
        </label>
        <button
          type="button"
          disabled={!guestId || !name.trim() || saving}
          onClick={() => void save()}
          className="h-10 shrink-0 rounded-lg bg-ink px-4 text-sm font-medium text-foam disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save name"}
        </button>
      </div>
    </section>
  );
}

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
type MediaPage = {
  limit: number;
  hasMore: boolean;
  nextCursor: string | null;
  totalReady: number;
  totalEditing: number;
  total: number;
};

const UPLOAD_CONCURRENCY = 4;
const MEDIA_PAGE_SIZE = 120;
const GALLERY_PAGE_SIZE = 48;
const LAST_EVENT_KEY = "eventvault.uploader.lastEventId";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function UploadPage() {
  const [events, setEvents] = useState<EventOption[] | null>(null);
  const [eventId, setEventId] = useState("");
  const [items, setItems] = useState<UploadItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [readyGallery, setReadyGallery] = useState<StagedPhoto[]>([]);
  const [editingGallery, setEditingGallery] = useState<StagedPhoto[]>([]);
  const [galleryTotals, setGalleryTotals] = useState({ ready: 0, editing: 0, total: 0 });
  const [loadingGallery, setLoadingGallery] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [readyCursor, setReadyCursor] = useState<string | null>(null);
  const [editingCursor, setEditingCursor] = useState<string | null>(null);
  const [readyHasMore, setReadyHasMore] = useState(false);
  const [editingHasMore, setEditingHasMore] = useState(false);
  const [guests, setGuests] = useState<NameOnlyGuest[]>([]);
  const [markNeedsEditing, setMarkNeedsEditing] = useState(false);
  const [bucket, setBucket] = useState<GalleryBucket>("ready");
  const [taggingId, setTaggingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [tagSaveHint, setTagSaveHint] = useState("");
  const [visibleCount, setVisibleCount] = useState(GALLERY_PAGE_SIZE);
  const [assistPhotos, setAssistPhotos] = useState<StagedPhoto[]>([]);
  const [assistLoading, setAssistLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cancelUploadRef = useRef(false);

  const loadGuests = useCallback(async (id: string) => {
    const res = await fetch(`/api/uploader/guests?eventId=${encodeURIComponent(id)}`);
    if (!res.ok) return;
    const data = (await res.json()) as { guests: NameOnlyGuest[] };
    setGuests(data.guests);
  }, []);

  const fetchMediaPage = useCallback(
    async (id: string, galleryBucket: GalleryBucket, cursor: string | null) => {
      const params = new URLSearchParams({
        eventId: id,
        bucket: galleryBucket,
        limit: String(MEDIA_PAGE_SIZE),
      });
      if (cursor) params.set("cursor", cursor);
      const res = await fetch(`/api/uploader/media?${params}`);
      if (res.status === 401) {
        window.location.assign("/upload/login");
        return null;
      }
      if (!res.ok) return null;
      return (await res.json()) as {
        media: StagedPhoto[];
        needsEditing: StagedPhoto[];
        all: StagedPhoto[];
        page: MediaPage;
      };
    },
    [],
  );

  const refreshGalleries = useCallback(
    async (id: string) => {
      setLoadingGallery(true);
      try {
        const [readyPage, editingPage] = await Promise.all([
          fetchMediaPage(id, "ready", null),
          fetchMediaPage(id, "editing", null),
        ]);
        if (!readyPage || !editingPage) return;

        setReadyGallery(readyPage.media || []);
        setEditingGallery(editingPage.needsEditing || []);
        setReadyCursor(readyPage.page.nextCursor);
        setEditingCursor(editingPage.page.nextCursor);
        setReadyHasMore(readyPage.page.hasMore);
        setEditingHasMore(editingPage.page.hasMore);
        setGalleryTotals({
          ready: readyPage.page.totalReady,
          editing: editingPage.page.totalEditing,
          total: readyPage.page.total,
        });
        setVisibleCount(GALLERY_PAGE_SIZE);
      } finally {
        setLoadingGallery(false);
      }
    },
    [fetchMediaPage],
  );

  /** Load every staged photo page — used by AI panels that need the full set. */
  const loadAllPhotos = useCallback(
    async (id: string): Promise<StagedPhoto[]> => {
      const collected: StagedPhoto[] = [];
      for (const galleryBucket of ["ready", "editing"] as const) {
        let cursor: string | null = null;
        let guard = 0;
        do {
          const page = await fetchMediaPage(id, galleryBucket, cursor);
          if (!page) break;
          collected.push(...(page.all || []));
          cursor = page.page.hasMore ? page.page.nextCursor : null;
          guard += 1;
        } while (cursor && guard < 200);
      }
      return collected;
    },
    [fetchMediaPage],
  );

  async function loadMoreBucket() {
    if (!eventId) return;
    setLoadingMore(true);
    try {
      if (bucket === "ready" && readyHasMore) {
        const page = await fetchMediaPage(eventId, "ready", readyCursor);
        if (!page) return;
        setReadyGallery((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          return [...prev, ...(page.media || []).filter((p) => !seen.has(p.id))];
        });
        setReadyCursor(page.page.nextCursor);
        setReadyHasMore(page.page.hasMore);
      } else if (bucket === "editing" && editingHasMore) {
        const page = await fetchMediaPage(eventId, "editing", editingCursor);
        if (!page) return;
        setEditingGallery((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          return [...prev, ...(page.needsEditing || []).filter((p) => !seen.has(p.id))];
        });
        setEditingCursor(page.page.nextCursor);
        setEditingHasMore(page.page.hasMore);
      }
    } finally {
      setLoadingMore(false);
    }
  }

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
      setEventId((current) => {
        if (current) return current;
        try {
          const saved = localStorage.getItem(LAST_EVENT_KEY) || "";
          if (saved && data.events.some((event) => event._id === saved)) return saved;
        } catch {
          // ignore storage errors
        }
        return data.events[0]?._id || "";
      });
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!eventId) return;
    try {
      localStorage.setItem(LAST_EVENT_KEY, eventId);
    } catch {
      // ignore storage errors
    }
    let active = true;
    (async () => {
      await Promise.all([refreshGalleries(eventId), loadGuests(eventId)]);
      if (!active) return;
    })();
    return () => {
      active = false;
    };
  }, [eventId, refreshGalleries, loadGuests]);

  const refreshAssistPhotos = useCallback(async () => {
    if (!eventId || galleryTotals.total === 0) {
      setAssistPhotos([]);
      return;
    }
    setAssistLoading(true);
    try {
      const all = await loadAllPhotos(eventId);
      setAssistPhotos(all);
    } finally {
      setAssistLoading(false);
    }
  }, [eventId, galleryTotals.total, loadAllPhotos]);

  useEffect(() => {
    void refreshAssistPhotos();
  }, [refreshAssistPhotos]);

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
    setMessage(
      next.length === 1
        ? `Added 1 photo to the queue. Tap Upload when ready.`
        : `Added ${next.length} photos to the queue. Tap Upload when ready.`,
    );
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function patchGalleryTags(id: string, taggedGuestIds: string[]) {
    const taggedNames = taggedGuestIds
      .map((guestId) => guests.find((g) => g._id === guestId)?.name)
      .filter((name): name is string => Boolean(name));
    const apply = (list: StagedPhoto[]) =>
      list.map((photo) =>
        photo.id === id ? { ...photo, taggedGuestIds, taggedNames } : photo,
      );
    setReadyGallery(apply);
    setEditingGallery(apply);
    setAssistPhotos((prev) => apply(prev));
  }

  async function updatePhoto(
    id: string,
    patch: { taggedGuestIds?: string[]; needsEditing?: boolean },
  ) {
    if (patch.taggedGuestIds) {
      patchGalleryTags(id, patch.taggedGuestIds);
      setTagSaveHint("Saved");
    }
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
      setTagSaveHint("");
      // Re-sync if the optimistic tag write failed.
      if (patch.taggedGuestIds) await refreshGalleries(eventId);
      return;
    }
    // Only reload galleries when the photo changes bucket (ready ↔ editing).
    if (typeof patch.needsEditing === "boolean") {
      await refreshGalleries(eventId);
      if (taggingId === id) setTaggingId(null);
    }
  }

  function updateItem(id: string, patch: Partial<UploadItem>) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  async function uploadOne(item: UploadItem): Promise<boolean> {
    if (cancelUploadRef.current) return false;
    updateItem(item.id, { status: "working", message: "Preparing…" });

    const lower = item.file.name.toLowerCase();
    const looksHeic =
      item.file.type === "image/heic" ||
      item.file.type === "image/heif" ||
      lower.endsWith(".heic") ||
      lower.endsWith(".heif");
    if (looksHeic) {
      updateItem(item.id, {
        status: "error",
        message: "HEIC not supported — in Photos, share/export as JPEG, then upload.",
      });
      return false;
    }

    let toSend: File = item.file;
    if (item.file.type.startsWith("image/") || !item.file.type) {
      try {
        const fileForResize = item.file.type
          ? item.file
          : new File([item.file], item.file.name, { type: "image/jpeg" });
        toSend = await resizeImageForUpload(fileForResize);
      } catch {
        updateItem(item.id, {
          status: "error",
          message: "Could not read that image. Try JPEG or PNG.",
        });
        return false;
      }
    }

    if (cancelUploadRef.current) {
      updateItem(item.id, { status: "pending", message: undefined });
      return false;
    }

    updateItem(item.id, { message: "Uploading…" });

    for (let attempt = 0; attempt < 5; attempt++) {
      if (cancelUploadRef.current) {
        updateItem(item.id, { status: "pending", message: undefined });
        return false;
      }
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
          return false;
        }
        if (res.status === 429) {
          const retryAfter = Number(res.headers.get("Retry-After") || "2");
          updateItem(item.id, {
            message: `Waiting ${Math.max(1, retryAfter)}s…`,
          });
          await sleep(Math.max(1, retryAfter) * 1000);
          continue;
        }
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          updateItem(item.id, { status: "error", message: json.error || "Upload failed" });
          return false;
        }
        updateItem(item.id, { status: "done", message: "Uploaded" });
        return true;
      } catch {
        if (attempt === 4) {
          updateItem(item.id, { status: "error", message: "Network error" });
          return false;
        }
        updateItem(item.id, { message: "Retrying…" });
        await sleep(1000 * (attempt + 1));
      }
    }
    updateItem(item.id, { status: "error", message: "Too many retries" });
    return false;
  }

  async function uploadAll() {
    if (!eventId) {
      setMessage("Pick an event first.");
      return;
    }
    const queue = items.filter((item) => item.status === "pending" || item.status === "error");
    if (queue.length === 0) return;

    cancelUploadRef.current = false;
    setBusy(true);
    setUploadProgress({ done: 0, total: queue.length });

    const results = await mapPool(
      queue,
      UPLOAD_CONCURRENCY,
      async (item) => uploadOne(item),
      (done, total) => setUploadProgress({ done, total }),
    );

    const uploaded = results.filter(Boolean).length;
    setBusy(false);
    setMessage(
      uploaded
        ? `Uploaded ${uploaded} of ${queue.length} photo${queue.length === 1 ? "" : "s"}${
            markNeedsEditing ? " to Needs editing" : " to the Main gallery"
          }. Next: clean/tag here, then open Admin → Media to send to groups.`
        : cancelUploadRef.current
          ? "Upload paused."
          : "",
    );
    if (markNeedsEditing && uploaded) setBucket("editing");
    await refreshGalleries(eventId);
  }

  function pauseUpload() {
    cancelUploadRef.current = true;
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
    setGalleryTotals((prev) => ({
      ...prev,
      ready: bucket === "ready" ? Math.max(0, prev.ready - 1) : prev.ready,
      editing: bucket === "editing" ? Math.max(0, prev.editing - 1) : prev.editing,
      total: Math.max(0, prev.total - 1),
    }));
    if (taggingId === id) setTaggingId(null);
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

  async function renameGuest(guestId: string, name: string): Promise<NameOnlyGuest | null> {
    const res = await fetch("/api/uploader/guests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, guestId, name }),
    });
    if (res.status === 401) {
      window.location.assign("/upload/login");
      return null;
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(json.error || "Could not rename that person.");
      return null;
    }
    const guest = json.guest as NameOnlyGuest;
    setGuests((prev) =>
      prev
        .map((row) => (row._id === guest._id ? guest : row))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
    await refreshGalleries(eventId);
    await refreshAssistPhotos();
    return guest;
  }

  async function signOut() {
    await fetch("/api/auth/uploader/logout", { method: "POST" });
    window.location.assign("/upload/login");
  }

  const pendingCount = items.filter(
    (item) => item.status === "pending" || item.status === "error",
  ).length;
  const doneCount = items.filter((item) => item.status === "done").length;
  const errorCount = items.filter((item) => item.status === "error").length;

  const activeGallery = bucket === "ready" ? readyGallery : editingGallery;
  const activeTotal = bucket === "ready" ? galleryTotals.ready : galleryTotals.editing;
  const activeHasMore = bucket === "ready" ? readyHasMore : editingHasMore;
  const visibleGallery = activeGallery.slice(0, visibleCount);

  function renderPhotoCard(photo: StagedPhoto) {
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
              onClick={() => {
                setTagSaveHint("");
                setTaggingId(photo.id);
              }}
              className="rounded-md border border-[color:var(--line)] px-2 py-1 text-xs text-ink hover:bg-mist"
            >
              Tag people
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
        </div>
      </div>
    );
  }

  const taggingPhoto =
    taggingId == null
      ? null
      : readyGallery.find((p) => p.id === taggingId) ||
        editingGallery.find((p) => p.id === taggingId) ||
        null;

  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-3xl px-6 py-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="font-[family-name:var(--font-fraunces)] text-2xl text-ink">EventVault</p>
          <h1 className="mt-1 font-[family-name:var(--font-fraunces)] text-3xl text-ink">
            Team photo upload
          </h1>
          <p className="mt-1 text-sm text-pine">
            Built for big drops (1000+). Dump photos here, clean and tag them, then send to groups
            from Admin → Media — same person, two screens.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <a
            href="/admin"
            className="rounded-lg border border-[color:var(--line)] bg-white px-3 py-2 text-sm text-ink hover:bg-mist"
          >
            Open Admin → Media
          </a>
          <button
            type="button"
            onClick={signOut}
            className="rounded-lg border border-[color:var(--line)] px-3 py-2 text-sm text-pine hover:text-ink"
          >
            Sign out
          </button>
        </div>
      </header>

      <ol className="mt-6 grid gap-2 rounded-xl border border-[color:var(--line)] bg-white p-4 text-sm text-pine sm:grid-cols-3">
        <li>
          <span className="font-medium text-ink">1. Pick the event</span>
          <span className="mt-0.5 block">Every upload goes under the event selected below.</span>
        </li>
        <li>
          <span className="font-medium text-ink">2. Upload · clean · sort</span>
          <span className="mt-0.5 block">
            Group-photo AI finds multi-person shots for Everyone; face tagging is for personal
            galleries only. Typo? Open <span className="font-medium text-ink">Tag people</span> →
            tap the black <span className="font-medium text-ink">Fix spelling</span> button under
            the name.
          </span>
        </li>
        <li>
          <span className="font-medium text-ink">3. Send the rest</span>
          <span className="mt-0.5 block">
            Publish group shots here, or open{" "}
            <a href="/admin" className="underline hover:text-ink">
              Admin → Media
            </a>{" "}
            to send other ready photos to specific groups.
          </span>
        </li>
      </ol>

      {loadError ? <p className="mt-6 text-sm text-red-700">{loadError}</p> : null}

      {events && events.length === 0 ? (
        <p className="mt-8 rounded-xl border border-[color:var(--line)] bg-white p-4 text-sm text-pine">
          No events exist yet. Create one in{" "}
          <a href="/admin" className="underline hover:text-ink">
            Admin
          </a>
          , then refresh this page.
        </p>
      ) : (
        <div className="mt-8 space-y-6">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-[0.08em] text-pine">
              Event — photos land here
            </span>
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
            <span className="text-xs text-pine">
              Last used event is remembered on this device. Switch before you upload if this isn’t
              the right weekend.
            </span>
          </label>

          <input
            ref={fileInputRef}
            id="uploader-file-input"
            type="file"
            accept="image/*,image/jpeg,image/png,image/webp,image/gif,.heic,.heif"
            multiple
            onChange={(e) => addFiles(e.target.files)}
            className="sr-only"
          />
          <div className="flex min-h-[9rem] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[color:var(--line)] bg-white px-4 py-6 text-center">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-foam"
            >
              Choose photos
            </button>
            <span className="text-sm text-pine">
              Pick many at once · JPEG/PNG/WebP/GIF · large photos auto-resize · uploads 4 at a
              time
            </span>
            <span className="max-w-md text-xs text-pine">
              On iPhone: tap Choose photos → Select (top right) → tap several photos → Add. If
              uploads stall, try again or convert HEIC to JPEG in Photos first.
            </span>
          </div>

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
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3 text-sm text-pine">
                <span>
                  Queue: {items.length} · done {doneCount}
                  {errorCount ? ` · failed ${errorCount}` : ""}
                  {pendingCount ? ` · left ${pendingCount}` : ""}
                </span>
                {busy ? (
                  <span className="font-medium text-ink">
                    Uploading {uploadProgress.done}/{uploadProgress.total}
                  </span>
                ) : null}
              </div>
              {busy ? (
                <div
                  className="h-2 overflow-hidden rounded-full bg-mist"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={uploadProgress.total || 1}
                  aria-valuenow={uploadProgress.done}
                >
                  <div
                    className="h-full bg-ink transition-[width] duration-300"
                    style={{
                      width: `${
                        uploadProgress.total
                          ? Math.round((uploadProgress.done / uploadProgress.total) * 100)
                          : 0
                      }%`,
                    }}
                  />
                </div>
              ) : null}
              <ul className="max-h-64 space-y-2 overflow-y-auto">
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
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void uploadAll()}
              disabled={busy || pendingCount === 0 || !eventId}
              className="inline-flex h-11 items-center justify-center rounded-lg bg-ink px-5 text-sm font-medium text-foam transition hover:bg-pine disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy
                ? `Uploading ${uploadProgress.done}/${uploadProgress.total}…`
                : pendingCount > 0
                  ? `Upload ${pendingCount} photo${pendingCount === 1 ? "" : "s"}`
                  : "Choose photos to upload"}
            </button>
            {busy ? (
              <button
                type="button"
                onClick={pauseUpload}
                className="inline-flex h-11 items-center justify-center rounded-lg border border-[color:var(--line)] px-4 text-sm text-pine hover:text-ink"
              >
                Pause
              </button>
            ) : null}
          </div>

          {message ? <p className="text-sm text-pine">{message}</p> : null}

          {eventId && galleryTotals.total > 0 ? (
            <>
              {assistLoading && assistPhotos.length === 0 ? (
                <p className="text-sm text-pine">Loading full gallery for AI tools…</p>
              ) : null}
              {assistPhotos.length > 0 ? (
                <>
                  <GroupPhotoAssistPanel
                    eventId={eventId}
                    photos={assistPhotos}
                    onPhotosChanged={async () => {
                      await refreshGalleries(eventId);
                      await refreshAssistPhotos();
                    }}
                    onMessage={setMessage}
                  />
                  <QualityAssistPanel
                    eventId={eventId}
                    photos={assistPhotos}
                    onPhotosChanged={async () => {
                      await refreshGalleries(eventId);
                      await refreshAssistPhotos();
                    }}
                    onMessage={setMessage}
                  />
                  <FaceAssistPanel
                    eventId={eventId}
                    guests={guests}
                    photos={assistPhotos}
                    onCreateGuest={createGuest}
                    onRenameGuest={renameGuest}
                    onGuestsChanged={async () => {
                      await loadGuests(eventId);
                    }}
                    onPhotosChanged={async () => {
                      await refreshGalleries(eventId);
                      await refreshAssistPhotos();
                    }}
                    onMessage={setMessage}
                  />
                </>
              ) : null}
            </>
          ) : null}

          {eventId && guests.length > 0 ? (
            <FixPersonNamePanel guests={guests} onRename={renameGuest} onMessage={setMessage} />
          ) : null}

          <section className="border-t border-[color:var(--line)] pt-6">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setBucket("ready");
                  setVisibleCount(GALLERY_PAGE_SIZE);
                }}
                aria-pressed={bucket === "ready"}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  bucket === "ready" ? "bg-ink text-foam" : "bg-mist text-pine"
                }`}
              >
                Main gallery ({galleryTotals.ready})
              </button>
              <button
                type="button"
                onClick={() => {
                  setBucket("editing");
                  setVisibleCount(GALLERY_PAGE_SIZE);
                }}
                aria-pressed={bucket === "editing"}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  bucket === "editing" ? "bg-ink text-foam" : "bg-mist text-pine"
                }`}
              >
                Needs editing ({galleryTotals.editing})
              </button>
              {loadingGallery ? (
                <span className="text-xs text-pine">Refreshing…</span>
              ) : null}
            </div>
            <p className="mt-2 text-sm text-pine">
              {bucket === "ready"
                ? "Ready for the admin to send to groups, or already tagged for someone’s personal gallery."
                : "Hidden from guests. Tag people here if you like, then mark ready when the edit is done."}
            </p>
            {activeGallery.length === 0 ? (
              <p className="mt-4 text-sm text-pine">Nothing here yet.</p>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {visibleGallery.map(renderPhotoCard)}
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  {visibleCount < activeGallery.length ? (
                    <button
                      type="button"
                      onClick={() => setVisibleCount((n) => n + GALLERY_PAGE_SIZE)}
                      className="rounded-lg border border-[color:var(--line)] px-3 py-2 text-sm text-ink hover:bg-mist"
                    >
                      Show more ({activeGallery.length - visibleCount} loaded)
                    </button>
                  ) : null}
                  {activeHasMore ? (
                    <button
                      type="button"
                      disabled={loadingMore}
                      onClick={() => void loadMoreBucket()}
                      className="rounded-lg border border-[color:var(--line)] px-3 py-2 text-sm text-ink hover:bg-mist disabled:opacity-50"
                    >
                      {loadingMore
                        ? "Loading…"
                        : `Load more from server (${activeTotal - activeGallery.length} left)`}
                    </button>
                  ) : null}
                </div>
              </>
            )}
          </section>
        </div>
      )}

      <TagPhotoModal
        open={Boolean(taggingPhoto)}
        photoUrl={taggingPhoto?.url || ""}
        photoTitle={taggingPhoto?.title || ""}
        guests={guests}
        selectedIds={taggingPhoto?.taggedGuestIds || []}
        disabled={savingId === taggingPhoto?.id}
        saveHint={tagSaveHint}
        onClose={() => {
          setTaggingId(null);
          setTagSaveHint("");
        }}
        onChange={(ids) => {
          if (!taggingPhoto) return;
          void updatePhoto(taggingPhoto.id, { taggedGuestIds: ids });
        }}
        onCreateGuest={createGuest}
        onRenameGuest={renameGuest}
      />
    </main>
  );
}
