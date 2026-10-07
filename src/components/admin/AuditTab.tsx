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

type UsageBucket = {
  all: number;
  today: number;
  last7Days: number;
  last30Days: number;
};

type UsageStats = {
  guestSignIns: UsageBucket;
  guestDownloads: UsageBucket;
  adminSignIns: UsageBucket;
  uploaderSignIns: UsageBucket;
  uniqueGuestsLast30Days: number;
};

type FilterId = "signins" | "all" | "guest" | "admin" | "uploader";

const EMPTY_BUCKET: UsageBucket = { all: 0, today: 0, last7Days: 0, last30Days: 0 };

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
  unpublish_media: "Removed photos from Whole event",
  tag_media: "Tagged people on a photo",
  import_guests: "Imported guests",
  email_ticket: "Emailed a ticket code",
  regenerate_group_code: "Regenerated a group login code",
  regenerate_gallery_code: "Regenerated Whole-event gallery code",
  mark_guest_paid: "Marked guest paid",
  consolidate_galleries: "Moved Shared → Whole event",
  recompress_media: "Recompressed photos",
  set_gallery_highlights: "Picked Weekend Highlights",
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
  const meta =
    details.meta && typeof details.meta === "object" && !Array.isArray(details.meta)
      ? (details.meta as Record<string, unknown>)
      : {};

  if (typeof details.summary === "string" && details.summary.trim()) {
    return details.summary.trim();
  }

  const tier = details.tier ?? meta.tier;
  const sharedLogin = details.sharedLogin ?? meta.sharedLogin;
  const galleryLogin = details.galleryLogin ?? meta.galleryLogin;
  const photoCount = details.photoCount ?? meta.photoCount;
  const loginCount = details.loginCount ?? meta.loginCount;

  const parts: string[] = [];

  if (entry.action === "guest_download" && typeof photoCount === "number") {
    parts.push(`${photoCount} photos`);
  }
  if (entry.action === "guest_login" && galleryLogin) {
    parts.push("Whole-event gallery code");
  } else if (entry.action === "guest_login" && sharedLogin) {
    parts.push("group shared login");
  }
  if (entry.action === "guest_login" && tier && !galleryLogin) {
    parts.push(String(tier).toUpperCase());
  }
  if (entry.action === "guest_login" && typeof loginCount === "number" && loginCount > 1) {
    parts.push(`${loginCount}× total`);
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
  if (details.reason === "invalid_code" || meta.reason === "invalid_code") {
    parts.push("wrong ticket code");
  }
  if (details.reason === "incorrect_password" || meta.reason === "incorrect_password") {
    parts.push("wrong password");
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

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-[color:var(--line)] bg-white/70 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-pine">{label}</p>
      <p className="mt-1 font-[family-name:var(--font-fraunces)] text-3xl text-ink">{value}</p>
      <p className="mt-1 text-xs text-pine">{hint}</p>
    </div>
  );
}

export function AuditTab({ eventId }: { eventId?: string }) {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<FilterId>("signins");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ auditLog: "1" });
      if (eventId) params.set("eventId", eventId);
      if (filter === "signins") params.set("focus", "signins");
      const response = await fetch(`/api/admin/data?${params}`);
      const json = await response.json();
      if (!response.ok) {
        setError(json.error || "Could not load activity");
        setLogs([]);
        setUsage(null);
        return;
      }
      setLogs(json.logs || []);
      setUsage(json.usage || null);
    } catch {
      setError("Could not load activity");
    } finally {
      setLoading(false);
    }
  }, [eventId, filter]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (filter === "signins" || filter === "all") return logs;
    return logs.filter((entry) => (entry.actor || "admin") === filter);
  }, [logs, filter]);

  const counts = useMemo(() => {
    const next = { signins: 0, all: logs.length, guest: 0, admin: 0, uploader: 0 };
    if (filter === "signins") {
      next.signins = logs.length;
    }
    for (const entry of logs) {
      const actor = entry.actor || "admin";
      if (actor === "guest") next.guest += 1;
      else if (actor === "uploader") next.uploader += 1;
      else next.admin += 1;
    }
    return next;
  }, [logs, filter]);

  const guestSignIns = usage?.guestSignIns || EMPTY_BUCKET;
  const downloads = usage?.guestDownloads || EMPTY_BUCKET;

  return (
    <div className="space-y-6">
      <AdminPanel
        title="Usage"
        description="How often people open the vault — sign-ins are logged automatically."
        action={
          <AdminButton onClick={load} disabled={loading} className="!h-9">
            {loading ? "Refreshing…" : "Refresh"}
          </AdminButton>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Guest sign-ins"
            value={guestSignIns.today}
            hint={`${guestSignIns.last7Days} this week · ${guestSignIns.all} total`}
          />
          <StatCard
            label="Unique guests (30d)"
            value={usage?.uniqueGuestsLast30Days ?? 0}
            hint={`${guestSignIns.last30Days} sign-ins in 30 days`}
          />
          <StatCard
            label="Downloads"
            value={downloads.last30Days}
            hint={`${downloads.all} photo ZIPs all time`}
          />
          <StatCard
            label="Team / admin"
            value={(usage?.adminSignIns.last7Days || 0) + (usage?.uploaderSignIns.last7Days || 0)}
            hint={`${usage?.adminSignIns.all || 0} admin · ${usage?.uploaderSignIns.all || 0} photo team`}
          />
        </div>
        <p className="mt-4 text-sm text-pine">
          Each vault ticket sign-in is saved with who, when, and whether they used a personal code or
          the Whole-event gallery code. Open <strong className="text-ink">Guests</strong> for per-person
          last seen and login counts.
        </p>
      </AdminPanel>

      <AdminPanel
        title="Sign-in log"
        description="Recent vault opens, downloads, and admin/team sign-ins."
      >
        <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Filter activity">
          {(
            [
              ["signins", "Sign-ins"],
              ["guest", "Guests"],
              ["admin", "Admin"],
              ["uploader", "Photo team"],
              ["all", "All activity"],
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
              {id !== "signins" && counts[id] ? ` (${counts[id]})` : ""}
              {id === "signins" && filter === "signins" && counts.signins
                ? ` (${counts.signins})`
                : ""}
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
            {filter === "signins"
              ? "No sign-ins yet. The next guest ticket or gallery-code login will show up here."
              : filter === "guest"
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
                    {entry.ip ? (
                      <p className="mt-0.5 text-[11px] text-pine/70">IP {entry.ip}</p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </AdminPanel>
    </div>
  );
}
