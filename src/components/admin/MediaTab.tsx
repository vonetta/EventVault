"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import { MediaGrid, type MediaItem } from "@/components/MediaGrid";
import { TagPhotoModal } from "@/components/TagPhotoModal";
import { HowTo } from "@/components/admin/HowTo";
import { AdminButton, AdminField, AdminPanel, inputClassName } from "@/components/admin/ui";
import type { NameOnlyGuest } from "@/lib/guest-name-match";
import { formatFileSize, resizeImageForUpload } from "@/lib/resize-image";
import { youtubeEmbedForRef, youtubeOpenUrlForRef } from "@/lib/youtube";
import type { AdminActions, AdminData, GuestDoc, MediaDoc, MediaFilter, SessionDoc } from "@/components/admin/types";

function mediaKindLabel(kind: string) {
  if (kind === "event_photo") return "Whole event";
  if (kind === "group_photo") return "Shared album";
  if (kind === "personal_photo") return "Photos of you (VIP)";
  if (kind === "session_video") return "Session";
  if (kind === "team_photo") return "Team photo";
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
  const [uploadKind, setUploadKind] = useState("event_photo");
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

  // Main gallery curation (staged team photos -> whole-event album)
  const [teamSelected, setTeamSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [sentSelected, setSentSelected] = useState<Set<string>>(new Set());
  const [unsending, setUnsending] = useState(false);
  const [taggingId, setTaggingId] = useState<string | null>(null);
  const [editingSelected, setEditingSelected] = useState<Set<string>>(new Set());
  const [togglingEdit, setTogglingEdit] = useState(false);
  const [stagedFilter, setStagedFilter] = useState<"all" | "untagged" | "tagged">("all");
  const [stagedVisibleCount, setStagedVisibleCount] = useState(60);
  const [sentVisibleCount, setSentVisibleCount] = useState(60);
  const [editingVisibleCount, setEditingVisibleCount] = useState(60);
  const [consolidating, setConsolidating] = useState(false);
  const [recompressing, setRecompressing] = useState(false);
  const nameOnlyGuests: NameOnlyGuest[] = useMemo(
    () =>
      data.guests
        .filter((guest) => !guest.isSharedLogin)
        .map((guest) => ({ _id: guest._id, name: guest.name })),
    [data.guests],
  );

  const vipGuests = useMemo(
    () => data.guests.filter((guest) => guest.tier === "vip"),
    [data.guests],
  );

  const needsEditingPhotos = useMemo(
    () => data.media.filter((item) => item.kind === "team_photo" && item.needsEditing),
    [data.media],
  );
  const stagedTeamPhotos = useMemo(
    () =>
      data.media.filter(
        (item) => item.kind === "team_photo" && !item.published && !item.needsEditing,
      ),
    [data.media],
  );
  const sentTeamPhotos = useMemo(
    () =>
      data.media.filter(
        (item) => item.kind === "event_photo" && item.published && !item.needsEditing,
      ),
    [data.media],
  );

  const filteredStagedPhotos = useMemo(() => {
    if (stagedFilter === "untagged") {
      // Keep the photo you're actively tagging visible so it doesn't jump away mid-edit.
      return stagedTeamPhotos.filter(
        (item) => !(item.taggedGuestIds || []).length || item._id === taggingId,
      );
    }
    if (stagedFilter === "tagged") {
      return stagedTeamPhotos.filter((item) => (item.taggedGuestIds || []).length > 0);
    }
    return stagedTeamPhotos;
  }, [stagedTeamPhotos, stagedFilter, taggingId]);

  const visibleStagedPhotos = useMemo(
    () => filteredStagedPhotos.slice(0, stagedVisibleCount),
    [filteredStagedPhotos, stagedVisibleCount],
  );
  const visibleNeedsEditing = useMemo(
    () => needsEditingPhotos.slice(0, editingVisibleCount),
    [needsEditingPhotos, editingVisibleCount],
  );
  const visibleSentPhotos = useMemo(
    () => sentTeamPhotos.slice(0, sentVisibleCount),
    [sentTeamPhotos, sentVisibleCount],
  );

  const untaggedStagedCount = useMemo(
    () => stagedTeamPhotos.filter((item) => !(item.taggedGuestIds || []).length).length,
    [stagedTeamPhotos],
  );
  const taggedStagedCount = useMemo(
    () => stagedTeamPhotos.filter((item) => (item.taggedGuestIds || []).length > 0).length,
    [stagedTeamPhotos],
  );

  const taggingMedia = useMemo(
    () => (taggingId ? data.media.find((item) => item._id === taggingId) || null : null),
    [data.media, taggingId],
  );

  function toggleIdInSet(setter: (fn: (prev: Set<string>) => Set<string>) => void, id: string) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllFilteredStaged() {
    setTeamSelected(new Set(filteredStagedPhotos.map((item) => item._id)));
  }

  function clearTeamSelection() {
    setTeamSelected(new Set());
  }

  function audienceLabel(_item: MediaDoc) {
    return "Whole event";
  }

  function toMediaItem(item: MediaDoc): MediaItem {
    const tags = (item.taggedGuestIds || [])
      .map((id) => data.guests.find((guest) => guest._id === id)?.name)
      .filter(Boolean);
    const base = item.uploadedByName
      ? `${item.title || item.filename} · ${item.uploadedByName}`
      : item.title || item.filename;
    return {
      id: item._id,
      title: tags.length ? `${base} · ${tags.join(", ")}` : base,
      contentType: item.contentType || "image/jpeg",
      url: `/api/media/${item._id}`,
    };
  }

  async function setNeedsEditing(mediaIds: string[], needsEditing: boolean) {
    if (!mediaIds.length) return;
    setTogglingEdit(true);
    const json = await actions.postAction({
      action: "set_needs_editing",
      mediaIds,
      needsEditing,
    });
    setTogglingEdit(false);
    if (!json) return;
    setEditingSelected(new Set());
    setTeamSelected((prev) => {
      const next = new Set(prev);
      for (const id of mediaIds) next.delete(id);
      return next;
    });
    actions.setMessage(
      needsEditing
        ? "Moved to Needs editing."
        : "Marked ready — back in the Main gallery.",
    );
    await actions.load(selectedEventId);
  }

  async function saveTags(mediaId: string, taggedGuestIds: string[]) {
    const json = await actions.postAction({
      action: "tag_media",
      mediaId,
      taggedGuestIds,
    });
    if (!json) return;
    // Reload data but keep the tagging modal open on this photo.
    await actions.load(selectedEventId);
  }

  async function createGuestName(name: string): Promise<NameOnlyGuest | null> {
    if (!data.event) return null;
    const json = await actions.postAction({
      action: "create_guest_name",
      eventId: data.event._id,
      name,
    });
    if (!json) return null;
    const guest = (json as { guest: NameOnlyGuest }).guest;
    await actions.load(selectedEventId);
    return guest;
  }

  async function renameGuestName(guestId: string, name: string): Promise<NameOnlyGuest | null> {
    if (!data.event) return null;
    const res = await fetch("/api/uploader/guests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: data.event._id, guestId, name }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      actions.setMessage(json.error || "Could not rename that person.");
      return null;
    }
    const guest = json.guest as NameOnlyGuest;
    actions.setMessage(`Renamed to ${guest.name}.`);
    await actions.load(selectedEventId);
    return guest;
  }

  async function sendTeamPhotos() {
    if (teamSelected.size === 0) return;
    setSending(true);
    const json = await actions.postAction({
      action: "publish_media",
      mediaIds: [...teamSelected],
      everyone: true,
      groupIds: [],
    });
    setSending(false);
    if (!json) return;
    const count = (json as { sent?: number }).sent ?? teamSelected.size;
    setTeamSelected(new Set());
    actions.setMessage(
      `Sent ${count} photo${count === 1 ? "" : "s"} to the whole-event album.`,
    );
    await actions.load(selectedEventId);
  }

  async function unsendTeamPhotos() {
    if (sentSelected.size === 0) return;
    setUnsending(true);
    const json = await actions.postAction({
      action: "unpublish_media",
      mediaIds: [...sentSelected],
    });
    setUnsending(false);
    if (!json) return;
    setSentSelected(new Set());
    actions.setMessage("Returned to the Main gallery.");
    await actions.load(selectedEventId);
  }

  async function consolidateGalleries() {
    if (!data.event) return;
    if (
      !confirm(
        "Move older Shared / group album photos into Whole event? Face tags stay. This cannot be undone from here.",
      )
    ) {
      return;
    }
    setConsolidating(true);
    const json = await actions.postAction({
      action: "consolidate_galleries",
      eventId: data.event._id,
    });
    setConsolidating(false);
    if (!json) return;
    const moved =
      ((json as { groupPhotosMoved?: number }).groupPhotosMoved || 0) +
      ((json as { teamPhotosMoved?: number }).teamPhotosMoved || 0);
    actions.setMessage(
      moved
        ? `Moved ${moved} photo${moved === 1 ? "" : "s"} into Whole event.`
        : "Nothing left to move — already in Whole event.",
    );
    await actions.load(selectedEventId);
  }

  async function recompressMedia() {
    if (!data.event) return;
    setRecompressing(true);
    let totalSaved = 0;
    let totalDone = 0;
    let rounds = 0;
    let hasMore = true;
    while (hasMore && rounds < 25) {
      rounds += 1;
      const json = await actions.postAction({
        action: "recompress_media",
        eventId: data.event._id,
        limit: 20,
      });
      if (!json) {
        setRecompressing(false);
        return;
      }
      const batch = json as {
        recompressed?: number;
        bytesSaved?: number;
        hasMore?: boolean;
      };
      totalDone += batch.recompressed || 0;
      totalSaved += batch.bytesSaved || 0;
      hasMore = Boolean(batch.hasMore);
      if (!(batch.recompressed || 0)) break;
    }
    setRecompressing(false);
    const mb = (totalSaved / (1024 * 1024)).toFixed(1);
    actions.setMessage(
      totalDone
        ? `Recompressed ${totalDone} photo${totalDone === 1 ? "" : "s"} (about ${mb} MB saved in R2).`
        : "Photos are already small enough — nothing to recompress.",
    );
    await actions.load(selectedEventId);
  }

  const filteredMediaItems = useMemo(() => {
    return data.media
      .filter((item) => item.kind !== "team_photo")
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
      <HowTo title="Same person? Upload here, send to Whole event" defaultOpen={stagedTeamPhotos.length > 0}>
        <p>
          If you shoot and run the vault yourself: dump the weekend on{" "}
          <a href="/upload" className="underline hover:text-ink">
            Photo upload
          </a>
          , clean rejects and tag faces there, then come back to this Media tab to Send ready photos
          to the whole-event album. Tagging alone puts a photo in that guest’s Photos of you — Send
          is what fills Whole event for everyone.
        </p>
        <p>
          Fix a typo on a tagged name: open <strong>Tag people</strong> (opens a popup with the
          photo) → tap the black <strong>Fix spelling</strong> button under the name. It updates
          that person on every photo.
        </p>
      </HowTo>

      <AdminPanel
        title="Gallery tools"
        description="One guest album (Whole event + Photos of you). Compress existing R2 files to cut storage cost."
      >
        <div className="flex flex-wrap gap-2">
          <AdminButton
            variant="secondary"
            disabled={consolidating || !data.event}
            onClick={() => void consolidateGalleries()}
          >
            {consolidating ? "Moving…" : "Move Shared → Whole event"}
          </AdminButton>
          <AdminButton
            variant="secondary"
            disabled={recompressing || !data.event}
            onClick={() => void recompressMedia()}
          >
            {recompressing ? "Recompressing…" : "Recompress large photos"}
          </AdminButton>
        </div>
        <p className="mt-3 text-xs text-pine">
          Recompress rewrites oversized stills to ~1600px JPEG (quality 78). Run after a big upload
          weekend; safe to click again — already-small files are skipped.
        </p>
      </AdminPanel>

      <AdminPanel
        title="Needs editing"
        description="Not ready for live view. Guests can’t see these, and they can’t be sent to a group until you mark them ready."
      >
        {needsEditingPhotos.length === 0 ? (
          <p className="text-sm text-pine">Nothing waiting on edits.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm text-pine">
              <span>
                Showing {visibleNeedsEditing.length} of {needsEditingPhotos.length}
              </span>
              <AdminButton
                variant="secondary"
                onClick={() =>
                  setEditingSelected(new Set(needsEditingPhotos.map((item) => item._id)))
                }
              >
                Select all
              </AdminButton>
              {editingSelected.size > 0 ? (
                <AdminButton variant="secondary" onClick={() => setEditingSelected(new Set())}>
                  Clear
                </AdminButton>
              ) : null}
            </div>
            <MediaGrid
              items={visibleNeedsEditing.map(toMediaItem)}
              selectable
              selectedIds={editingSelected}
              onToggleSelect={(id) => toggleIdInSet(setEditingSelected, id)}
              onRemove={deleteMedia}
              showCaptions
            />
            {editingVisibleCount < needsEditingPhotos.length ? (
              <AdminButton
                variant="secondary"
                onClick={() => setEditingVisibleCount((n) => n + 60)}
              >
                Show more ({needsEditingPhotos.length - editingVisibleCount} left)
              </AdminButton>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <AdminButton
                variant="primary"
                disabled={togglingEdit || editingSelected.size === 0}
                onClick={() => void setNeedsEditing([...editingSelected], false)}
              >
                {togglingEdit ? "Saving…" : `Mark ${editingSelected.size || ""} ready`.trim()}
              </AdminButton>
            </div>
            <div className="space-y-2">
              {visibleNeedsEditing.map((item) => (
                <div
                  key={`edit-tag-${item._id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[color:var(--line)] bg-white px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink">{item.title || item.filename}</p>
                    <p className="truncate text-xs text-pine">
                      {(item.taggedGuestIds || []).length
                        ? `${(item.taggedGuestIds || []).length} tagged`
                        : "No one tagged"}
                    </p>
                  </div>
                  <AdminButton
                    className="!h-8 !px-3 !text-xs"
                    onClick={() => setTaggingId(item._id)}
                  >
                    Tag people
                  </AdminButton>
                </div>
              ))}
            </div>
          </div>
        )}
      </AdminPanel>

      <AdminPanel
        title="Main gallery — ready to send"
        description="Photos waiting on this event. Guests don’t see them under Whole event until you Send below. Tagged people can already unlock them under Photos of you."
      >
        {stagedTeamPhotos.length === 0 ? (
          <p className="text-sm text-pine">
            Nothing waiting.{" "}
            <a href="/upload" className="underline hover:text-ink">
              Upload photos
            </a>{" "}
            for this event first (unless they’re still in Needs editing).
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  { id: "all" as const, label: `All (${stagedTeamPhotos.length})` },
                  { id: "untagged" as const, label: `Untagged (${untaggedStagedCount})` },
                  { id: "tagged" as const, label: `Tagged (${taggedStagedCount})` },
                ] as const
              ).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={stagedFilter === option.id}
                  onClick={() => {
                    setStagedFilter(option.id);
                    setStagedVisibleCount(60);
                  }}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    stagedFilter === option.id ? "bg-ink text-foam" : "bg-mist text-pine"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm text-pine">
              <span>
                Showing {visibleStagedPhotos.length} of {filteredStagedPhotos.length}
                {teamSelected.size ? ` · ${teamSelected.size} selected` : ""}
              </span>
              <AdminButton variant="secondary" onClick={selectAllFilteredStaged}>
                Select all {stagedFilter === "all" ? "ready" : stagedFilter}
              </AdminButton>
              {teamSelected.size > 0 ? (
                <AdminButton variant="secondary" onClick={clearTeamSelection}>
                  Clear selection
                </AdminButton>
              ) : null}
            </div>

            <MediaGrid
              items={visibleStagedPhotos.map(toMediaItem)}
              selectable
              selectedIds={teamSelected}
              onToggleSelect={(id) => toggleIdInSet(setTeamSelected, id)}
              onRemove={deleteMedia}
              showCaptions
            />
            {stagedVisibleCount < filteredStagedPhotos.length ? (
              <AdminButton
                variant="secondary"
                onClick={() => setStagedVisibleCount((n) => n + 60)}
              >
                Show more ({filteredStagedPhotos.length - stagedVisibleCount} left)
              </AdminButton>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <AdminButton
                variant="secondary"
                disabled={togglingEdit || teamSelected.size === 0}
                onClick={() => void setNeedsEditing([...teamSelected], true)}
              >
                Move to Needs editing
              </AdminButton>
            </div>

            <div className="rounded-xl border border-[color:var(--line)] bg-white p-4">
              <p className="text-sm font-medium text-ink">
                Send {teamSelected.size} selected {teamSelected.size === 1 ? "photo" : "photos"} to
                Whole event
              </p>
              <p className="mt-1 text-xs text-pine">
                Every guest sees these in the free whole-event album. People you tagged still get
                them under Photos of you.
              </p>
              <AdminButton
                variant="primary"
                className="mt-4"
                disabled={sending || teamSelected.size === 0}
                onClick={sendTeamPhotos}
              >
                {sending
                  ? "Sending…"
                  : `Send ${teamSelected.size || ""} to Whole event`.trim()}
              </AdminButton>
            </div>

            <div className="space-y-2">
              {visibleStagedPhotos.map((item) => (
                <div
                  key={`tag-${item._id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[color:var(--line)] bg-white px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink">{item.title || item.filename}</p>
                    <p className="truncate text-xs text-pine">
                      {(item.taggedGuestIds || []).length
                        ? `${(item.taggedGuestIds || []).length} tagged`
                        : "No one tagged"}
                    </p>
                  </div>
                  <AdminButton
                    className="!h-8 !px-3 !text-xs"
                    onClick={() => setTaggingId(item._id)}
                  >
                    Tag people
                  </AdminButton>
                </div>
              ))}
            </div>
          </div>
        )}
      </AdminPanel>

      {sentTeamPhotos.length ? (
        <AdminPanel
          title="In Whole event"
          description="Already visible to every guest. Select and return them to the Main gallery to hide them again."
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm text-pine">
              <span>
                Showing {visibleSentPhotos.length} of {sentTeamPhotos.length}
              </span>
              <AdminButton
                variant="secondary"
                onClick={() => setSentSelected(new Set(sentTeamPhotos.map((item) => item._id)))}
              >
                Select all
              </AdminButton>
              {sentSelected.size > 0 ? (
                <AdminButton variant="secondary" onClick={() => setSentSelected(new Set())}>
                  Clear
                </AdminButton>
              ) : null}
            </div>
            <MediaGrid
              items={visibleSentPhotos.map((item) => ({
                ...toMediaItem(item),
                title: `${audienceLabel(item)}${(item.taggedGuestIds || []).length ? ` · tagged ${(item.taggedGuestIds || []).length}` : ""}`,
              }))}
              selectable
              selectedIds={sentSelected}
              onToggleSelect={(id) => toggleIdInSet(setSentSelected, id)}
            />
            {sentVisibleCount < sentTeamPhotos.length ? (
              <AdminButton variant="secondary" onClick={() => setSentVisibleCount((n) => n + 60)}>
                Show more ({sentTeamPhotos.length - sentVisibleCount} left)
              </AdminButton>
            ) : null}
            {sentSelected.size > 0 ? (
              <AdminButton variant="secondary" disabled={unsending} onClick={unsendTeamPhotos}>
                {unsending ? "Returning…" : `Return ${sentSelected.size} to Main gallery`}
              </AdminButton>
            ) : null}
            <div className="space-y-2">
              {visibleSentPhotos.map((item) => (
                <div
                  key={`sent-tag-${item._id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[color:var(--line)] bg-white px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink">{item.title || item.filename}</p>
                    <p className="truncate text-xs text-pine">
                      {(item.taggedGuestIds || []).length
                        ? `${(item.taggedGuestIds || []).length} tagged`
                        : "No one tagged"}
                    </p>
                  </div>
                  <AdminButton
                    className="!h-8 !px-3 !text-xs"
                    onClick={() => setTaggingId(item._id)}
                  >
                    Tag people
                  </AdminButton>
                </div>
              ))}
            </div>
          </div>
        </AdminPanel>
      ) : null}

      <AdminPanel
        title="Media library"
        description={`${data.media.length} file${data.media.length === 1 ? "" : "s"} for this event`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter media">
              {(
                [
                  ["all", "All"],
                  ["event_photo", "Whole event"],
                  ["personal_photo", "Of you"],
                  ["session_video", "Sessions"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => { setMediaFilter(value); setSelectedMediaIds(new Set()); }}
                  aria-pressed={mediaFilter === value}
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

      <AdminPanel title="Upload photos" description="Whole event = every guest. VIP = Photos of you for one guest.">
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
              <option value="event_photo">Whole-event photo (every guest)</option>
              <option value="personal_photo">VIP — Photos of you</option>
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
            <span className="text-sm text-pine">
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

      <TagPhotoModal
        open={Boolean(taggingMedia)}
        photoUrl={taggingMedia ? `/api/media/${taggingMedia._id}` : ""}
        photoTitle={taggingMedia ? taggingMedia.title || taggingMedia.filename : ""}
        guests={nameOnlyGuests}
        selectedIds={taggingMedia?.taggedGuestIds || []}
        onClose={() => setTaggingId(null)}
        onChange={(ids) => {
          if (!taggingMedia) return;
          void saveTags(taggingMedia._id, ids);
        }}
        onCreateGuest={createGuestName}
        onRenameGuest={renameGuestName}
      />
    </>
  );
}
