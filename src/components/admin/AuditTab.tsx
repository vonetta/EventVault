"use client";

import { useEffect, useState } from "react";
import { AdminPanel } from "@/components/admin/ui";

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

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/admin/data?auditLog=1");
        if (response.ok) {
          const json = await response.json();
          setLogs(json.logs || []);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function formatAction(action: string) {
    return action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function formatDetails(details: Record<string, unknown>) {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(details)) {
      if (key === "eventId" || key === "guestId" || key === "mediaId" || key === "sessionId") continue;
      if (value === undefined || value === null || value === "") continue;
      parts.push(`${key}: ${String(value)}`);
    }
    return parts.join(" · ");
  }

  return (
    <AdminPanel title="Admin audit log" description="Last 100 actions recorded by the system.">
      {loading ? (
        <p className="text-sm text-pine/70">Loading audit log…</p>
      ) : !logs.length ? (
        <p className="text-sm text-pine/70">No audit entries yet.</p>
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
                    {formatDetails(entry.details)}
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
