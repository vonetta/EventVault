"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import { MediaGrid, type MediaItem } from "@/components/MediaGrid";
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
                onClick={() => setMediaFilter(value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  mediaFilter === value ? "bg-ink text-foam" : "bg-mist text-pine"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        }
      >
        <MediaGrid
          items={filteredMediaItems}
          emptyMessage="No media yet — upload photos below."
          onRemove={deleteMedia}
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
            className="flex min-h-[9rem] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-pine/25 bg-mist/40 px-4 py-6 text-center transition hover:border-gold/50 hover:bg-mist/70"
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

      <AdminPanel title="YouTube sessions" description="Upload to YouTube as Unlisted, then paste a video or playlist link.">
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
