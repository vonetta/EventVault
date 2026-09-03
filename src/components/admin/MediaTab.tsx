"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import { MediaGrid, type MediaItem } from "@/components/MediaGrid";
import { HowTo } from "@/components/admin/HowTo";
import { AdminButton, AdminField, AdminPanel, inputClassName } from "@/components/admin/ui";
import { formatFileSize, resizeImageForUpload } from "@/lib/resize-image";
import { youtubeEmbedForRef, youtubeOpenUrlForRef } from "@/lib/youtube";
import type { AdminActions, AdminData, GuestDoc, MediaDoc, MediaFilter, SessionDoc } from "@/components/admin/types";

function mediaKindLabel(kind: string) {
  if (kind === "group_photo") return "Group gallery";
  if (kind === "personal_photo") return "VIP personal";
  if (kind === "session_video") return "Session";
  return kind;
}

function mapAdminMediaItem(
  item: MediaDoc,
  guests: GuestDoc[],
  sessions: SessionDoc[],
): MediaItem | null {
  const baseTitle = item.title || item.filename;

  if (item.storageProvider === "youtube") {
    if (item.youtubePlaylistId) {
      const ref = { type: "playlist" as const, id: item.youtubePlaylistId };
      return {
        id: item._id,
        title: baseTitle,
        contentType: "video/youtube-playlist",
        provider: "youtube",
        url: youtubeOpenUrlForRef(ref),
        embedUrl: youtubeEmbedForRef(ref),
        availableUntil: item.availableUntil,
      };
    }
    if (item.youtubeId) {
      const ref = { type: "video" as const, id: item.youtubeId };
      return {
        id: item._id,
        title: baseTitle,
        contentType: "video/youtube",
        provider: "youtube",
        url: youtubeOpenUrlForRef(ref),
        embedUrl: youtubeEmbedForRef(ref),
        availableUntil: item.availableUntil,
      };
    }
  }

  const guest = guests.find((g) => g._id === item.guestId);
  const session = sessions.find((s) => s._id === item.sessionId);
  const suffix = guest ? ` · ${guest.name}` : session ? ` · ${session.title}` : "";

  return {
    id: item._id,
    title: `${mediaKindLabel(item.kind)}${suffix ? suffix : ""}: ${baseTitle}`,
    contentType: item.contentType || "image/jpeg",
    url: `/api/media/${item._id}`,
    availableUntil: item.availableUntil,
  };
}

export function MediaTab({
  data,
  selectedEventId,
  actions,
}: {
  data: AdminData;
  selectedEventId: string;
  actions: AdminActions;
}) {
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>("all");
  const [uploadKind, setUploadKind] = useState("group_photo");
  const [uploadGuestId, setUploadGuestId] = useState("");
  const [uploadSessionId, setUploadSessionId] = useState(() => data.sessions[0]?._id || "");
  const [file, setFile] = useState<File | null>(null);
  const [resizingFile, setResizingFile] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeTitle, setYoutubeTitle] = useState("");
  const [youtubeSessionId, setYoutubeSessionId] = useState(() => data.sessions[0]?._id || "");
  const [youtubeUntil, setYoutubeUntil] = useState("");
  const [linkingYoutube, setLinkingYoutube] = useState(false);
  const [selectedMediaIds, setSelectedMediaIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const vipGuests = useMemo(
    () => data.guests.filter((guest) => guest.tier === "vip"),
    [data.guests],
  );

  const filteredMediaItems = useMemo(() => {
    return data.media
      .filter((item) => mediaFilter === "all" || item.kind === mediaFilter)
      .map((item) => mapAdminMediaItem(item, data.guests, data.sessions))
      .filter((item): item is MediaItem => Boolean(item));
  }, [data, mediaFilter]);

  async function onUploadFileSelected(selected: File | null) {
    if (!selected) {
      setFile(null);
      return;
    }
    if (uploadKind === "session_video" || !selected.type.startsWith("image/")) {
      setFile(selected);
      return;
    }
    setResizingFile(true);
    try {
      const resized = await resizeImageForUpload(selected);
      setFile(resized);
      if (resized.size < selected.size) {
        actions.setMessage(
          `Resized ${selected.name} for upload (${formatFileSize(selected.size)} → ${formatFileSize(resized.size)}).`,
        );
      }
    } catch {
      setFile(selected);
    } finally {
      setResizingFile(false);
    }
  }

  async function uploadMedia(event: FormEvent) {
    event.preventDefault();
    if (!data.event || !file) return;
    setUploading(true);
    const form = new FormData();
    form.set("file", file);
    form.set("eventId", data.event._id);
    form.set("kind", uploadKind);
    form.set("title", file.name);
    if (uploadKind === "personal_photo") form.set("guestId", uploadGuestId);
    if (uploadKind === "session_video") form.set("sessionId", uploadSessionId);
    const response = await fetch("/api/admin/upload", { method: "POST", body: form });
    const json = await response.json();
    setUploading(false);
    if (!response.ok) {
      actions.setMessage(json.error || "Upload failed");
      return;
    }
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    actions.setMessage("Media uploaded.");
    await actions.load(data.event._id);
  }

  async function deleteMedia(mediaId: string) {
    if (!confirm("Remove this media record?")) return;
    const json = await actions.postAction({ action: "delete_media", mediaId });
    if (!json) return;
    actions.setMessage("Media removed.");
    await actions.load(selectedEventId);
  }

  async function addYoutubeSession(event: FormEvent) {
    event.preventDefault();
    if (!data.event) return;
    setLinkingYoutube(true);
    const json = await actions.postAction({
      action: "add_youtube_session",
      eventId: data.event._id,
      sessionId: youtubeSessionId,
      youtubeUrl,
      title: youtubeTitle || undefined,
      availableUntil: youtubeUntil || undefined,
    });
    setLinkingYoutube(false);
    if (!json) return;
    setYoutubeUrl("");
    setYoutubeTitle("");
    actions.setMessage(
      youtubeUntil
        ? `YouTube session linked (available until ${youtubeUntil}). Use Unlisted on YouTube.`
        : "YouTube session linked. Use Unlisted on YouTube.",
    );
    await actions.load(data.event._id);
  }

  return (
    <>
      <AdminPanel
        title="Media library"
        description={`${data.media.length} file${data.media.length === 1 ? "" : "s"} for this event`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["all", "All"],
                  ["group_photo", "Group"],
                  ["personal_photo", "VIP"],
                  ["session_video", "Sessions"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => { setMediaFilter(value); setSelectedMediaIds(new Set()); }}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    mediaFilter === value ? "bg-ink text-foam" : "bg-mist text-pine"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {filteredMediaItems.length > 1 ? (
              <label className="flex items-center gap-1.5 text-xs text-pine">
                <input
                  type="checkbox"
                  checked={selectedMediaIds.size === filteredMediaItems.length && filteredMediaItems.length > 0}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedMediaIds(new Set(filteredMediaItems.map((m) => m.id)));
                    } else {
                      setSelectedMediaIds(new Set());
                    }
                  }}
                  className="h-3.5 w-3.5"
                />
                Select all
              </label>
            ) : null}
          </div>
        }
      >
        {selectedMediaIds.size > 0 ? (
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50/80 px-4 py-2">
            <span className="text-sm text-red-800">{selectedMediaIds.size} selected</span>
            <AdminButton
              variant="danger"
              className="!h-8 !px-3 !text-xs"
              disabled={bulkDeleting}
              onClick={async () => {
                if (!confirm(`Delete ${selectedMediaIds.size} media file(s)?`)) return;
                setBulkDeleting(true);
                const json = await actions.postAction({
                  action: "bulk_delete_media",
                  mediaIds: [...selectedMediaIds],
                });
                setBulkDeleting(false);
                if (!json) return;
                setSelectedMediaIds(new Set());
                actions.setMessage(`Deleted ${(json as { deleted: number }).deleted} file(s).`);
                await actions.load(selectedEventId);
              }}
            >
              {bulkDeleting ? "Deleting…" : `Delete ${selectedMediaIds.size}`}
            </AdminButton>
            <button type="button" onClick={() => setSelectedMediaIds(new Set())} className="text-xs text-pine underline">
              Clear
            </button>
          </div>
        ) : null}
        <MediaGrid
          items={filteredMediaItems}
          emptyMessage="No media yet — upload photos below."
          onRemove={deleteMedia}
          selectable
          selectedIds={selectedMediaIds}
          onToggleSelect={(id) => {
            setSelectedMediaIds((prev) => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            });
          }}
        />
      </AdminPanel>

      <AdminPanel title="Upload photos" description="Group gallery for everyone. VIP personal photos go to one guest only.">
        <form onSubmit={uploadMedia} className="grid gap-4">
          <AdminField label="Photo type">
            <select
              value={uploadKind}
              onChange={(e) => {
                setUploadKind(e.target.value);
                setFile(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              className={inputClassName}
            >
              <option value="group_photo">Group gallery photo</option>
              <option value="personal_photo">VIP personal photo</option>
              <option value="session_video">Session file (fallback)</option>
            </select>
          </AdminField>

          {uploadKind === "personal_photo" ? (
            <AdminField label="VIP guest">
              <select value={uploadGuestId} onChange={(e) => setUploadGuestId(e.target.value)} required className={inputClassName}>
                <option value="">Select VIP guest</option>
                {vipGuests.map((guest) => (
                  <option key={guest._id} value={guest._id}>{guest.name}</option>
                ))}
              </select>
            </AdminField>
          ) : null}

          {uploadKind === "session_video" ? (
            <AdminField label="Session">
              <select value={uploadSessionId} onChange={(e) => setUploadSessionId(e.target.value)} required className={inputClassName}>
                <option value="">Select session</option>
                {data.sessions.map((session) => (
                  <option key={session._id} value={session._id}>{session.title}</option>
                ))}
              </select>
            </AdminField>
          ) : null}

          <input
            ref={fileInputRef}
            id="photo-upload-input"
            type="file"
            accept={
              uploadKind === "session_video"
                ? "image/*,video/mp4,video/webm,video/quicktime"
                : "image/jpeg,image/png,image/webp,image/gif"
            }
            onChange={(e) => void onUploadFileSelected(e.target.files?.[0] || null)}
            className="sr-only"
          />
          <label
            htmlFor="photo-upload-input"
            className="flex min-h-[9rem] cursor-pointer flex-col items-center justify-center gap-2 border-2 border-dashed border-[color:var(--line)] bg-white px-4 py-6 text-center transition hover:border-ink/30"
          >
            <span className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-foam">Choose photo</span>
            <span className="text-sm text-pine/80">
              {file ? (
                <>Selected: <strong className="text-ink">{file.name}</strong></>
              ) : (
                "JPEG, PNG, WebP, or GIF · large photos are auto-resized before upload"
              )}
            </span>
          </label>

          <AdminButton type="submit" variant="primary" disabled={!file || resizingFile || uploading} className="w-full sm:w-auto">
            {uploading ? "Uploading…" : resizingFile ? "Preparing photo…" : file ? `Upload ${file.name}` : "Choose a file first"}
          </AdminButton>
        </form>
      </AdminPanel>

      <HowTo title="Where to paste YouTube URLs" defaultOpen={!data.media.some((item) => item.storageProvider === "youtube")}>
        <p>Paste URLs here, not on the Event tab. Use <strong>one video per speaker session</strong> so talks stay grouped by day.</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>If the Session dropdown is empty, go to <strong>Event</strong> and add speaker sessions first.</li>
          <li>Select the talk (for example “Morning worship”).</li>
          <li>Paste that speaker’s single video URL, such as <code>https://youtu.be/…</code>.</li>
          <li>Click <strong>Link YouTube</strong>, then repeat for the next talk.</li>
        </ol>
        <p>Set videos to <strong>Unlisted</strong> on YouTube. Do not paste a full playlist if you want 2–3 separate talks per day.</p>
      </HowTo>

      <AdminPanel title="YouTube sessions" description="Pick a speaker session, then paste that talk’s Unlisted YouTube video URL.">
        <form onSubmit={addYoutubeSession} className="grid gap-4 sm:grid-cols-2">
          <AdminField label="Session">
            <select value={youtubeSessionId} onChange={(e) => setYoutubeSessionId(e.target.value)} required className={inputClassName}>
              <option value="">Select session</option>
              {data.sessions.map((session) => (
                <option key={session._id} value={session._id}>{session.title}</option>
              ))}
            </select>
          </AdminField>
          <AdminField label="Title (optional)">
            <input value={youtubeTitle} onChange={(e) => setYoutubeTitle(e.target.value)} className={inputClassName} />
          </AdminField>
          <AdminField label="YouTube URL" className="sm:col-span-2">
            <input value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} placeholder="youtu.be/… or playlist?list=…" required className={inputClassName} />
          </AdminField>
          <AdminField label="Available until (optional)" className="sm:col-span-2">
            <input type="date" value={youtubeUntil} onChange={(e) => setYoutubeUntil(e.target.value)} className={inputClassName} />
          </AdminField>
          <AdminButton type="submit" variant="primary" disabled={linkingYoutube} className="sm:col-span-2 sm:w-auto">
            {linkingYoutube ? "Linking…" : "Link YouTube"}
          </AdminButton>
        </form>
      </AdminPanel>
    </>
  );
}
