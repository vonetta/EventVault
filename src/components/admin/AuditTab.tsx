"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminButton, AdminPanel } from "@/components/admin/ui";

type AuditEntry = {
  _id: string;
  action: string;
  details: Record<string, unknown>;
  ip: string;
  createdAt: string;
};

function formatAction(action: string) {
  return action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDetails(details: Record<string, unknown>) {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(details || {})) {
    if (value === undefined || value === null || value === "") continue;
    if (typeof value === "object") continue;
    parts.push(String(value));
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

export function AuditTab() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/data?auditLog=1");
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
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <AdminPanel
      title="Activity"
      description="Recent admin changes."
      action={
        <AdminButton onClick={load} disabled={loading} className="!h-9">
          {loading ? "Refreshing…" : "Refresh"}
        </AdminButton>
      }
    >
      {loading ? (
        <p className="text-sm text-pine">Loading…</p>
      ) : error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : !logs.length ? (
        <p className="text-sm text-pine">
          No activity yet. New changes will show up here after you save sessions, link videos, import guests, or upload photos.
        </p>
      ) : (
        <ul>
          {logs.map((entry) => {
            const when = formatWhen(entry.createdAt);
            const detail = formatDetails(entry.details);
            return (
              <li key={entry._id} className="flex gap-4 border-b border-[color:var(--line)] py-3 last:border-b-0">
                <div className="w-16 shrink-0 text-right">
                  <p className="text-xs text-ink">{when.day}</p>
                  <p className="text-[11px] text-pine">{when.time}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">{formatAction(entry.action)}</p>
                  {detail ? <p className="mt-0.5 truncate text-sm text-pine">{detail}</p> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </AdminPanel>
  );
}
