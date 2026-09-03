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

  function formatAction(action: string) {
    return action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function formatDetails(details: Record<string, unknown>) {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(details || {})) {
      if (value === undefined || value === null || value === "") continue;
      if (typeof value === "object") continue;
      parts.push(`${key}: ${String(value)}`);
    }
    return parts.join(" · ");
  }

  return (
    <AdminPanel
      title="Admin audit log"
      description="A history of admin changes — adding sessions, importing guests, uploads, deletes, and emails."
      action={
        <AdminButton onClick={load} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </AdminButton>
      }
    >
      {loading ? (
        <p className="text-sm text-pine/70">Loading audit log…</p>
      ) : error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : !logs.length ? (
        <div className="space-y-2 text-sm text-pine/80">
          <p>Nothing is recorded yet.</p>
          <p>
            Earlier work (adding sessions, editing titles) was not logged. New actions will appear
            here after you add a session, link a YouTube video, import guests, upload a photo, or send an email.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead>
              <tr className="border-b border-[color:var(--line)] text-xs uppercase tracking-wide text-pine/60">
                <th className="py-2 pr-3">When</th>
                <th className="py-2 pr-3">Action</th>
                <th className="py-2 pr-3">Details</th>
                <th className="py-2">IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((entry) => (
                <tr key={entry._id} className="border-b border-[color:var(--line)] last:border-0">
                  <td className="py-2 pr-3 text-xs text-pine/70 whitespace-nowrap">
                    {new Date(entry.createdAt).toLocaleString()}
                  </td>
                  <td className="py-2 pr-3 font-medium text-ink whitespace-nowrap">
                    {formatAction(entry.action)}
                  </td>
                  <td className="py-2 pr-3 text-pine/80 text-xs">
                    {formatDetails(entry.details) || "—"}
                  </td>
                  <td className="py-2 text-xs text-pine/60 font-mono">{entry.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminPanel>
  );
}
