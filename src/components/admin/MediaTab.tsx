"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import { MediaGrid, type MediaItem } from "@/components/MediaGrid";
import { NeedsEditingZipExport } from "@/components/NeedsEditingZipExport";
import { TagPhotoModal } from "@/components/TagPhotoModal";
import { HowTo } from "@/components/admin/HowTo";
import { AdminButton, AdminField, AdminPanel, inputClassName } from "@/components/admin/ui";
import type { NameOnlyGuest } from "@/lib/guest-name-match";
import {
  candidateFromQuality,
  pickHighlights,
} from "@/lib/gallery-highlights";
import { editGuestIdsFrom, showsInNeedsEditing } from "@/lib/needs-editing";
import { analyzePhotoQuality, mapPool } from "@/lib/photo-quality";
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
  const [editingFilter, setEditingFilter] = useState<"all" | "untagged" | "tagged">("all");
  const [sentFilter, setSentFilter] = useState<"all" | "untagged" | "tagged">("all");
  const [stagedVisibleCount, setStagedVisibleCount] = useState(60);
  const [sentVisibleCount, setSentVisibleCount] = useState(60);
  const [editingVisibleCount, setEditingVisibleCount] = useState(60);
  const [consolidating, setConsolidating] = useState(false);
  const [recompressing, setRecompressing] = useState(false);
  const [pickingHighlights, setPickingHighlights] = useState(false);
  const [highlightProgress, setHighlightProgress] = useState({ done: 0, total: 0 });
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

  const editGuestIds = useMemo(() => editGuestIdsFrom(data.guests), [data.guests]);

  const needsEditingPhotos = useMemo(
    () =>
      data.media.filter(
        (item) =>
          (item.kind === "team_photo" ||
            item.kind === "event_photo" ||
            item.kind === "group_photo") &&
          showsInNeedsEditing(item, editGuestIds),
      ),
    [data.media, editGuestIds],
  );
  const stagedTeamPhotos = useMemo(
    () =>
      data.media.filter(
        (item) =>
          item.kind === "team_photo" &&
          !item.published &&
          !showsInNeedsEditing(item, editGuestIds),
      ),
    [data.media, editGuestIds],
  );
  const sentTeamPhotos = useMemo(
    () =>
      data.media.filter(
        (item) =>
          (item.kind === "event_photo" || item.kind === "group_photo") &&
          item.published !== false &&
          !showsInNeedsEditing(item, editGuestIds),
      ),
    [data.media, editGuestIds],
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

  const filteredNeedsEditing = useMemo(() => {
    if (editingFilter === "untagged") {
      return needsEditingPhotos.filter(
        (item) => !(item.taggedGuestIds || []).length || item._id === taggingId,
      );
    }
    if (editingFilter === "tagged") {
      return needsEditingPhotos.filter((item) => (item.taggedGuestIds || []).length > 0);
    }
    return needsEditingPhotos;
  }, [needsEditingPhotos, editingFilter, taggingId]);

  const filteredSentPhotos = useMemo(() => {
    if (sentFilter === "untagged") {
      return sentTeamPhotos.filter(
        (item) => !(item.taggedGuestIds || []).length || item._id === taggingId,
      );
    }
    if (sentFilter === "tagged") {
      return sentTeamPhotos.filter((item) => (item.taggedGuestIds || []).length > 0);
    }
    return sentTeamPhotos;
  }, [sentTeamPhotos, sentFilter, taggingId]);

  const visibleStagedPhotos = useMemo(
    () => filteredStagedPhotos.slice(0, stagedVisibleCount),
    [filteredStagedPhotos, stagedVisibleCount],
  );
  const visibleNeedsEditing = useMemo(
    () => filteredNeedsEditing.slice(0, editingVisibleCount),
    [filteredNeedsEditing, editingVisibleCount],
  );
  const visibleSentPhotos = useMemo(
    () => filteredSentPhotos.slice(0, sentVisibleCount),
    [filteredSentPhotos, sentVisibleCount],
  );

  const untaggedStagedCount = useMemo(
    () => stagedTeamPhotos.filter((item) => !(item.taggedGuestIds || []).length).length,
    [stagedTeamPhotos],
  );
  const taggedStagedCount = useMemo(
    () => stagedTeamPhotos.filter((item) => (item.taggedGuestIds || []).length > 0).length,
    [stagedTeamPhotos],
  );
  const untaggedEditingCount = useMemo(
    () => needsEditingPhotos.filter((item) => !(item.taggedGuestIds || []).length).length,
    [needsEditingPhotos],
  );
  const taggedEditingCount = useMemo(
    () => needsEditingPhotos.filter((item) => (item.taggedGuestIds || []).length > 0).length,
    [needsEditingPhotos],
  );
  const untaggedSentCount = useMemo(
    () => sentTeamPhotos.filter((item) => !(item.taggedGuestIds || []).length).length,
    [sentTeamPhotos],
  );
  const taggedSentCount = useMemo(
    () => sentTeamPhotos.filter((item) => (item.taggedGuestIds || []).length > 0).length,
    [sentTeamPhotos],
  );

  const untaggedTotal =
    untaggedEditingCount + untaggedStagedCount + untaggedSentCount;
  const taggedPhotoTotal =
    taggedEditingCount + taggedStagedCount + taggedSentCount;
  const taggablePhotoTotal =
    needsEditingPhotos.length + stagedTeamPhotos.length + sentTeamPhotos.length;


  const taggingMedia = useMemo(
    () => (taggingId ? data.media.find((item) => item._id === taggingId) || null : null),
    [data.media, taggingId],
  );

  function toggleIdInSet(setter: (fn: (prev: Set<string>) => Set<string>) => void, id: string) {
    const key = String(id);
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAllFilteredStaged() {
    setTeamSelected(new Set(filteredStagedPhotos.map((item) => String(item._id))));
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
      id: String(item._id),
      title: tags.length ? `${base} · ${tags.join(", ")}` : base,
      contentType: item.contentType || "image/jpeg",
      url: `/api/media/${String(item._id)}`,
    };
  }

  async function setNeedsEditing(mediaIds: string[], needsEditing: boolean) {
    if (!mediaIds.length) return;
    const ids = mediaIds.map(String);
    setTogglingEdit(true);
    const json = await actions.postAction({
      action: "set_needs_editing",
      mediaIds: ids,
      needsEditing,
    });
    setTogglingEdit(false);
    if (!json) return;
    setEditingSelected(new Set());
    setTeamSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
    setSentSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
    if (needsEditing) {
      // Land on the edit section so tagged / quality-flagged shots are visible.
      setEditingFilter("all");
      setEditingVisibleCount(60);
    }
    actions.setMessage(
      needsEditing
        ? `Moved ${ids.length} photo${ids.length === 1 ? "" : "s"} to Needs editing.`
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
    const media = (json as {
      media?: { hasEditTag?: boolean; removedEditTag?: boolean; needsEditing?: boolean };
    }).media;
    if (media?.hasEditTag) {
      setEditingFilter("all");
      setEditingVisibleCount(60);
      actions.setMessage("Tagged Edit — showing under Needs editing (tag kept).");
      setTaggingId(null);
    } else if (media?.removedEditTag) {
      actions.setMessage("Removed Edit — photo back in Main gallery.");
      setTaggingId(null);
    }
    // Reload data but keep the tagging modal open on this photo (unless moved).
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
    const selected = stagedTeamPhotos.filter((item) => teamSelected.has(String(item._id)));
    const taggedIds = selected
      .filter((item) => (item.taggedGuestIds || []).length > 0)
      .map((item) => String(item._id));
    const untaggedCount = selected.length - taggedIds.length;
    if (!taggedIds.length) {
      actions.setMessage(
        "Tag people on each photo before sending. Untagged photos stay in Main gallery.",
      );
      return;
    }
    setSending(true);
    const json = await actions.postAction({
      action: "publish_media",
      mediaIds: taggedIds,
      everyone: true,
      groupIds: [],
    });
    setSending(false);
    if (!json) return;
    const count = (json as { sent?: number }).sent ?? taggedIds.length;
    setTeamSelected(new Set());
    actions.setMessage(
      untaggedCount
        ? `Sent ${count} tagged photo${count === 1 ? "" : "s"} to Whole event. Skipped ${untaggedCount} untagged — tag them first.`
        : `Sent ${count} photo${count === 1 ? "" : "s"} to the whole-event album.`,
    );
    await actions.load(selectedEventId);
  }

  async function unsendTeamPhotos() {
    if (sentSelected.size === 0) return;
    const count = sentSelected.size;
    if (
      !confirm(
        `Remove ${count} photo${count === 1 ? "" : "s"} from Whole event? Guests will no longer see them. They’ll go back to Main gallery so you can edit or send again.`,
      )
    ) {
      return;
    }
    setUnsending(true);
    const json = await actions.postAction({
      action: "unpublish_media",
      mediaIds: [...sentSelected],
    });
    setUnsending(false);
    if (!json) return;
    const removed = (json as { removed?: number }).removed ?? count;
    setSentSelected(new Set());
    actions.setMessage(
      `Removed ${removed} photo${removed === 1 ? "" : "s"} from Whole event — back in Main gallery.`,
    );
    await actions.load(selectedEventId);
  }

  async function deleteSentPhotos() {
    if (sentSelected.size === 0) return;
    const count = sentSelected.size;
    if (
      !confirm(
        `Permanently delete ${count} photo${count === 1 ? "" : "s"} from Whole event? This cannot be undone.`,
      )
    ) {
      return;
    }
    setBulkDeleting(true);
    const ids = [...sentSelected];
    // API caps bulk delete at 200 — chunk if needed.
    let deleted = 0;
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const json = await actions.postAction({
        action: "bulk_delete_media",
        mediaIds: chunk,
      });
      if (!json) {
        setBulkDeleting(false);
        return;
      }
      deleted += (json as { deleted: number }).deleted;
    }
    setBulkDeleting(false);
    setSentSelected(new Set());
    actions.setMessage(`Deleted ${deleted} photo${deleted === 1 ? "" : "s"} from Whole event.`);
    await actions.load(selectedEventId);
  }

  async function consolidateGalleries() {
    if (!data.event) return;
    if (
      !confirm(
        "Move older Shared / group album photos into Whole event? Person tags stay. This cannot be undone from here.",
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

  async function pickWeekendHighlights() {
    if (!data.event) return;
    const candidates = data.media.filter(
      (item) =>
        (item.kind === "event_photo" || item.kind === "group_photo") &&
        !item.needsEditing &&
        (item.contentType || "").startsWith("image/") &&
        (item.taggedGuestIds || []).length > 0,
    );
    if (!candidates.length) {
      actions.setMessage(
        "No tagged Whole-event photos yet. Tag people, send to Whole event, then pick highlights.",
      );
      return;
    }

    setPickingHighlights(true);
    setHighlightProgress({ done: 0, total: candidates.length });
    try {
      const analyzed = await mapPool(
        candidates,
        4,
        async (item) => {
          try {
            const quality = await analyzePhotoQuality(`/api/media/${item._id}`);
            return candidateFromQuality(String(item._id), quality);
          } catch {
            return candidateFromQuality(String(item._id), {
              sharpness: 0,
              brightness: 128,
              aHash: "",
              dHash: "",
              needsEditing: true,
            });
          }
        },
        (done, total) => setHighlightProgress({ done, total }),
      );
      const mediaIds = pickHighlights(analyzed);
      const qualityIndex = analyzed
        .filter((item) => item.aHash.length === 16 && item.dHash.length === 16)
        .map((item) => ({
          mediaId: item.id,
          aHash: item.aHash,
          dHash: item.dHash,
          sharpness: item.sharpness,
        }));
      const json = await actions.postAction({
        action: "set_gallery_highlights",
        eventId: data.event._id,
        mediaIds,
        qualityIndex,
      });
      if (!json) return;
      const count = Number((json as { count?: number }).count || mediaIds.length);
      const indexed = Number((json as { indexed?: number }).indexed || 0);
      actions.setMessage(
        count
          ? `Weekend Highlights ready — ${count} strongest shot${count === 1 ? "" : "s"}.${indexed ? ` Indexed ${indexed} photos so guests browse collapsed bursts.` : ""}`
          : "Couldn’t find strong enough shots yet — check that Whole event photos aren’t all soft or dark.",
      );
      await actions.load(selectedEventId);
    } finally {
      setPickingHighlights(false);
      setHighlightProgress({ done: 0, total: 0 });
    }
  }

  async function clearWeekendHighlights() {
    if (!data.event) return;
    const json = await actions.postAction({
      action: "set_gallery_highlights",
      eventId: data.event._id,
      mediaIds: [],
    });
    if (!json) return;
    actions.setMessage("Cleared Weekend Highlights.");
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
      <AdminPanel
        title="Tagging progress"
        description="Live count across Needs editing, Main gallery, and Whole event — so you know what’s left."
      >
        <div className="flex flex-wrap items-end gap-6">
          <div>
            <p className="text-3xl font-[family-name:var(--font-fraunces)] text-ink">
              {untaggedTotal}
            </p>
            <p className="text-sm text-pine">untagged left</p>
          </div>
          <div>
            <p className="text-2xl font-[family-name:var(--font-fraunces)] text-ink">
              {taggedPhotoTotal}
              <span className="ml-1 text-base text-pine">/ {taggablePhotoTotal}</span>
            </p>
            <p className="text-sm text-pine">photos with at least one name</p>
          </div>
        </div>
        <ul className="mt-4 grid gap-1 text-sm text-pine sm:grid-cols-3">
          <li>
            Needs editing:{" "}
            <strong className="text-ink">{untaggedEditingCount}</strong> untagged
          </li>
          <li>
            Main gallery:{" "}
            <strong className="text-ink">{untaggedStagedCount}</strong> untagged
          </li>
          <li>
            Whole event:{" "}
            <strong className="text-ink">{untaggedSentCount}</strong> untagged
          </li>
        </ul>
        <p className="mt-3 text-xs text-pine">
          In each section below, tap <strong>Untagged</strong> to work only the leftovers.
        </p>
      </AdminPanel>

      <HowTo title="Same person? Upload here, send to Whole event" defaultOpen={stagedTeamPhotos.length > 0}>
        <p>
          If you shoot and run the vault yourself: dump the weekend on{" "}
          <a href="/upload" className="underline hover:text-ink">
            Photo upload
          </a>
          , clean rejects and tag faces there, then come back to this Media tab to Send ready photos
          to the whole-event album. Tag 1–2 people on a personal shot for Photos of you
          (watermarked until unlock). Tag <strong>Edit</strong> to park a photo under Needs
          editing (the Edit tag stays visible — remove it to put the photo back in Main gallery).
          Big group shots: use Group photos → Whole event on upload so they stay free for everyone.
        </p>
        <p>
          Fix a typo on a tagged name: tap <strong>Tag</strong> on the photo (opens a popup) → tap
          the black <strong>Fix spelling</strong> button under the name. It updates that person on
          every photo.
        </p>
      </HowTo>

      <AdminPanel
        title="Gallery tools"
        description="One guest album (Whole event + Photos of you). Auto-pick Weekend Highlights or compress R2 files."
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
          <AdminButton
            variant="secondary"
            disabled={pickingHighlights || !data.event}
            onClick={() => void pickWeekendHighlights()}
          >
            {pickingHighlights
              ? `Picking highlights… ${highlightProgress.done}/${highlightProgress.total || "…"}`
              : "Auto-pick Weekend Highlights"}
          </AdminButton>
          {data.media.some(
            (item) => typeof item.highlightOrder === "number" && item.highlightOrder > 0,
          ) ? (
            <AdminButton
              variant="secondary"
              disabled={pickingHighlights || !data.event}
              onClick={() => void clearWeekendHighlights()}
            >
              Clear highlights
            </AdminButton>
          ) : null}
        </div>
        <p className="mt-3 text-xs text-pine">
          Auto-pick scans Whole event photos for sharpness and exposure, collapses near-duplicate
          bursts, saves about 20–40 diverse strongest shots for Highlights, and indexes hashes so
          guests browse moments instead of every burst frame. Recompress keeps camera EXIF while
          rewriting oversized stills to ~1600px JPEG.
        </p>
      </AdminPanel>

      <AdminPanel
        title="Needs editing"
        description="Quality rejects, Move to Needs editing, or photos tagged Edit. Edit-tagged shots keep the Edit name — remove that tag to return them to Main gallery. Guests can’t see these."
      >
        {needsEditingPhotos.length === 0 ? (
          <p className="text-sm text-pine">Nothing waiting on edits.</p>
        ) : (
          <div className="space-y-4">
            <NeedsEditingZipExport
              eventId={selectedEventId}
              photoCount={needsEditingPhotos.length}
              onMessage={actions.setMessage}
              loginPath="/admin/login"
            />
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  { id: "all" as const, label: `All (${needsEditingPhotos.length})` },
                  { id: "untagged" as const, label: `Untagged (${untaggedEditingCount})` },
                  { id: "tagged" as const, label: `Tagged (${taggedEditingCount})` },
                ] as const
              ).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={editingFilter === option.id}
                  onClick={() => {
                    setEditingFilter(option.id);
                    setEditingVisibleCount(60);
                  }}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    editingFilter === option.id ? "bg-ink text-foam" : "bg-mist text-pine"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-pine">
              <span>
                Showing {visibleNeedsEditing.length} of {filteredNeedsEditing.length}
                {editingSelected.size ? ` · ${editingSelected.size} selected` : ""}
              </span>
              <AdminButton
                variant="secondary"
                onClick={() =>
                  setEditingSelected(
                    new Set(filteredNeedsEditing.map((item) => String(item._id))),
                  )
                }
              >
                Select all {editingFilter === "all" ? "" : editingFilter}
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
              onTag={setTaggingId}
              showCaptions
            />
            {editingVisibleCount < filteredNeedsEditing.length ? (
              <AdminButton
                variant="secondary"
                onClick={() => setEditingVisibleCount((n) => n + 60)}
              >
                Show more ({filteredNeedsEditing.length - editingVisibleCount} left)
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
          </div>
        )}
      </AdminPanel>

      <AdminPanel
        title="Main gallery — ready to send"
        description="Photos waiting to go live. Tag people first — untagged photos cannot go to Whole event."
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
              onTag={setTaggingId}
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
                Only tagged photos go live. Untagged stay here until you name people. Tag 1–2 for
                Photos of you (watermarked until unlock); crowd tags stay free in Whole event.
              </p>
              <AdminButton
                variant="primary"
                className="mt-4"
                disabled={sending || teamSelected.size === 0}
                onClick={sendTeamPhotos}
              >
                {sending
                  ? "Sending…"
                  : `Send tagged to Whole event${
                      teamSelected.size
                        ? ` (${
                            stagedTeamPhotos.filter(
                              (item) =>
                                teamSelected.has(String(item._id)) &&
                                (item.taggedGuestIds || []).length > 0,
                            ).length
                          })`
                        : ""
                    }`}
              </AdminButton>
            </div>
          </div>
        )}
      </AdminPanel>

      {sentTeamPhotos.length ? (
        <AdminPanel
          title="In Whole event"
          description="Visible to every guest. Select photos to remove them from the album, send them to Needs editing, or delete forever."
        >
          <div className="space-y-4">
            <p className="rounded-xl border border-[color:var(--line)] bg-mist/50 px-3 py-2 text-sm text-pine">
              Tip: tap photos to select, then <strong className="text-ink">Remove from Whole event</strong>{" "}
              (back to Main gallery) or <strong className="text-ink">Delete</strong> (permanent).
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  { id: "all" as const, label: `All (${sentTeamPhotos.length})` },
                  { id: "untagged" as const, label: `Untagged (${untaggedSentCount})` },
                  { id: "tagged" as const, label: `Tagged (${taggedSentCount})` },
                ] as const
              ).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={sentFilter === option.id}
                  onClick={() => {
                    setSentFilter(option.id);
                    setSentVisibleCount(60);
                  }}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    sentFilter === option.id ? "bg-ink text-foam" : "bg-mist text-pine"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-pine">
              <span>
                Showing {visibleSentPhotos.length} of {filteredSentPhotos.length}
                {sentSelected.size ? ` · ${sentSelected.size} selected` : ""}
              </span>
              <AdminButton
                variant="secondary"
                onClick={() =>
                  setSentSelected(new Set(filteredSentPhotos.map((item) => String(item._id))))
                }
              >
                Select all {sentFilter === "all" ? "" : sentFilter}
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
              onRemove={deleteMedia}
              onTag={setTaggingId}
            />
            {sentVisibleCount < filteredSentPhotos.length ? (
              <AdminButton variant="secondary" onClick={() => setSentVisibleCount((n) => n + 60)}>
                Show more ({filteredSentPhotos.length - sentVisibleCount} left)
              </AdminButton>
            ) : null}
            {sentSelected.size > 0 ? (
              <div className="flex flex-wrap gap-2">
                <AdminButton variant="primary" disabled={unsending} onClick={unsendTeamPhotos}>
                  {unsending
                    ? "Removing…"
                    : `Remove ${sentSelected.size} from Whole event`}
                </AdminButton>
                <AdminButton
                  variant="secondary"
                  disabled={togglingEdit}
                  onClick={() => void setNeedsEditing([...sentSelected], true)}
                >
                  {togglingEdit
                    ? "Saving…"
                    : `Move ${sentSelected.size} to Needs editing`}
                </AdminButton>
                <AdminButton
                  variant="danger"
                  disabled={bulkDeleting}
                  onClick={() => void deleteSentPhotos()}
                >
                  {bulkDeleting ? "Deleting…" : `Delete ${sentSelected.size}`}
                </AdminButton>
              </div>
            ) : null}
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
