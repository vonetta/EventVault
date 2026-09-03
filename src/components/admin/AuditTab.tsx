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
        setError(json.error || "Could not load audit log");
        setLogs([]);
        return;
      }
      setLogs(json.logs || []);
    } catch {
      setError("Could not load audit log");
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
      description="Recent changes in this admin account."
      action={
        <AdminButton onClick={load} disabled={loading} className="!h-9">
          {loading ? "Refreshing…" : "Refresh"}
        </AdminButton>
      }
    >
      {loading ? (
        <p className="text-sm text-pine/60">Loading…</p>
      ) : error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : !logs.length ? (
        <div className="rounded-2xl border border-dashed border-[color:var(--line)] bg-mist/30 px-5 py-10 text-center">
          <p className="font-[family-name:var(--font-fraunces)] text-lg text-ink">No activity yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-pine/70">
            New changes will show up here — sessions, YouTube links, guest imports, uploads, and emails.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-[color:var(--line)]">
          {logs.map((entry) => {
            const when = formatWhen(entry.createdAt);
            const detail = formatDetails(entry.details);
            return (
              <li key={entry._id} className="flex gap-4 py-3.5 first:pt-0 last:pb-0">
                <div className="w-16 shrink-0 pt-0.5 text-right">
                  <p className="text-xs font-medium text-ink">{when.day}</p>
                  <p className="text-[11px] text-pine/55">{when.time}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{formatAction(entry.action)}</p>
                  {detail ? <p className="mt-0.5 truncate text-sm text-pine/70">{detail}</p> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </AdminPanel>
  );
}
