"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminButton, AdminPanel } from "@/components/admin/ui";

type ActivityActor = "guest" | "admin" | "uploader" | "system";

type AuditEntry = {
  _id: string;
  action: string;
  actor?: ActivityActor;
  actorName?: string;
  guestId?: string | null;
  eventId?: string | null;
  details: Record<string, unknown>;
  ip: string;
  createdAt: string;
};

type FilterId = "all" | "guest" | "admin" | "uploader";

const ACTION_LABELS: Record<string, string> = {
  guest_login: "Signed in to vault",
  guest_login_failed: "Failed vault sign-in",
  guest_logout: "Signed out of vault",
  guest_download: "Downloaded photos",
  guest_zelle_pending: "Marked Zelle as sent",
  admin_login: "Admin signed in",
  admin_login_failed: "Failed admin sign-in",
  admin_logout: "Admin signed out",
  uploader_login: "Photo team signed in",
  uploader_login_failed: "Failed photo-team sign-in",
  uploader_logout: "Photo team signed out",
  upload_media: "Uploaded media",
  publish_media: "Sent photos to Whole event",
  publish_group_photos_everyone: "Published group photos to Whole event",
  unpublish_media: "Returned photos to Main gallery",
  tag_media: "Tagged people on a photo",
  import_guests: "Imported guests",
  email_ticket: "Emailed a ticket code",
  mark_guest_paid: "Marked guest paid",
  consolidate_galleries: "Moved Shared → Whole event",
  recompress_media: "Recompressed photos",
};

function formatAction(action: string) {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  return action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function actorLabel(actor?: ActivityActor) {
  if (actor === "guest") return "Guest";
  if (actor === "uploader") return "Team";
  if (actor === "system") return "System";
  return "Admin";
}

function actorTone(actor?: ActivityActor) {
  if (actor === "guest") return "bg-white text-ink ring-1 ring-[color:var(--line)]";
  if (actor === "uploader") return "bg-mist text-pine";
  return "bg-ink text-foam";
}

function formatDetails(entry: AuditEntry) {
  const details = entry.details || {};
  const parts: string[] = [];

  if (entry.action === "guest_download") {
    const count = details.photoCount;
    if (typeof count === "number") parts.push(`${count} photos`);
  }
  if (entry.action === "guest_login" && details.sharedLogin) {
    parts.push("group shared login");
  }
  if (entry.action === "guest_login" && details.tier) {
    parts.push(String(details.tier).toUpperCase());
  }
  if (entry.action === "guest_zelle_pending") {
    parts.push("waiting for payment confirm");
  }
  if (typeof details.count === "number") parts.push(`${details.count} items`);
  if (typeof details.sent === "number") parts.push(`${details.sent} sent`);
  if (typeof details.tags === "number") parts.push(`${details.tags} tagged`);
  if (typeof details.recompressed === "number" && details.recompressed) {
    parts.push(`${details.recompressed} recompressed`);
  }
  if (typeof details.bytesSaved === "number" && details.bytesSaved > 0) {
    parts.push(`${(details.bytesSaved / (1024 * 1024)).toFixed(1)} MB saved`);
  }
  if (typeof details.groupPhotosMoved === "number" || typeof details.teamPhotosMoved === "number") {
    const moved =
      (typeof details.groupPhotosMoved === "number" ? details.groupPhotosMoved : 0) +
      (typeof details.teamPhotosMoved === "number" ? details.teamPhotosMoved : 0);
    parts.push(`${moved} moved`);
  }
  if (typeof details.guestName === "string" && details.guestName) {
    parts.push(details.guestName);
  }
  if (typeof details.name === "string" && details.name && details.name !== entry.actorName) {
    parts.push(details.name);
  }
  if (typeof details.title === "string" && details.title) parts.push(details.title);
  if (details.reason === "invalid_code") parts.push("wrong ticket code");
  if (details.reason === "incorrect_password") parts.push("wrong password");

  // Fallback: include a few simple scalar fields we haven't already used.
  const used = new Set([
    "photoCount",
    "wholeEvent",
    "photosOfYou",
    "sharedLogin",
    "tier",
    "loginCount",
    "personalPhotos",
    "sessions",
    "count",
    "sent",
    "tags",
    "recompressed",
    "scanned",
    "skipped",
    "bytesSaved",
    "hasMore",
    "groupPhotosMoved",
    "teamPhotosMoved",
    "guestName",
    "name",
    "title",
    "reason",
    "actor",
    "uploadedByName",
    "eventId",
    "mediaId",
    "mediaIds",
  ]);
  for (const [key, value] of Object.entries(details)) {
    if (used.has(key)) continue;
    if (value === undefined || value === null || value === "") continue;
    if (typeof value === "object") continue;
    if (typeof value === "boolean") {
      if (value) parts.push(key);
      continue;
    }
    parts.push(String(value));
    if (parts.length >= 4) break;
  }

  return parts.join(" · ");
}

function formatWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { day: "", time: "" };
  return {
    day: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    time: date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
  };
}

function whoLabel(entry: AuditEntry) {
  if (entry.actorName?.trim()) return entry.actorName.trim();
  if (typeof entry.details?.guestName === "string" && entry.details.guestName) {
    return String(entry.details.guestName);
  }
  if (typeof entry.details?.uploadedByName === "string" && entry.details.uploadedByName) {
    return String(entry.details.uploadedByName);
  }
  return actorLabel(entry.actor);
}

export function AuditTab({ eventId }: { eventId?: string }) {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<FilterId>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ auditLog: "1" });
      if (eventId) params.set("eventId", eventId);
      const response = await fetch(`/api/admin/data?${params}`);
      const json = await response.json();
      if (!response.ok) {
        setError(json.error || "Could not load activity");
        setLogs([]);
        return;
      }
      setLogs(json.logs || []);
    } catch {
      setError("Could not load activity");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (filter === "all") return logs;
    return logs.filter((entry) => (entry.actor || "admin") === filter);
  }, [logs, filter]);

  const counts = useMemo(() => {
    const next = { all: logs.length, guest: 0, admin: 0, uploader: 0 };
    for (const entry of logs) {
      const actor = entry.actor || "admin";
      if (actor === "guest") next.guest += 1;
      else if (actor === "uploader") next.uploader += 1;
      else next.admin += 1;
    }
    return next;
  }, [logs]);

  return (
    <AdminPanel
      title="Activity"
      description="Who signed in and what they did — guests, admin, and the photo team."
      action={
        <AdminButton onClick={load} disabled={loading} className="!h-9">
          {loading ? "Refreshing…" : "Refresh"}
        </AdminButton>
      }
    >
      <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Filter activity">
        {(
          [
            ["all", "All"],
            ["guest", "Guests"],
            ["admin", "Admin"],
            ["uploader", "Photo team"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              filter === id ? "bg-ink text-foam" : "bg-mist text-pine"
            }`}
          >
            {label}
            {counts[id] ? ` (${counts[id]})` : ""}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-pine">Loading…</p>
      ) : error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : !filtered.length ? (
        <p className="text-sm text-pine">
          {filter === "guest"
            ? "No guest activity yet. Sign-ins, downloads, and Zelle taps will show up here."
            : filter === "all"
              ? "No activity yet. Guest sign-ins and admin changes will appear here."
              : "Nothing in this filter yet."}
        </p>
      ) : (
        <ul>
          {filtered.map((entry) => {
            const when = formatWhen(entry.createdAt);
            const detail = formatDetails(entry);
            const who = whoLabel(entry);
            return (
              <li
                key={entry._id}
                className="flex gap-4 border-b border-[color:var(--line)] py-3 last:border-b-0"
              >
                <div className="w-16 shrink-0 text-right">
                  <p className="text-xs text-ink">{when.day}</p>
                  <p className="text-[11px] text-pine">{when.time}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${actorTone(entry.actor)}`}
                    >
                      {actorLabel(entry.actor)}
                    </span>
                    <p className="text-sm font-medium text-ink">{who}</p>
                  </div>
                  <p className="mt-0.5 text-sm text-ink">{formatAction(entry.action)}</p>
                  {detail ? (
                    <p className="mt-0.5 truncate text-sm text-pine">{detail}</p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </AdminPanel>
  );
}
