"use client";

import { FormEvent, useState } from "react";
import { HowTo } from "@/components/admin/HowTo";
import { AdminButton, AdminField, AdminPanel, StatusBadge, inputClassName } from "@/components/admin/ui";
import type { AdminData } from "@/components/admin/types";

export function EmailTab({
  data,
  setMessage,
}: {
  data: AdminData;
  setMessage: (msg: string) => void;
}) {
  const [testEmailTo, setTestEmailTo] = useState("");
  const [sendingTestEmail, setSendingTestEmail] = useState(false);

  async function sendTestEmail(event: FormEvent) {
    event.preventDefault();
    const to = testEmailTo.trim();
    if (!to) {
      setMessage("Enter an email address for the test.");
      return;
    }
    setSendingTestEmail(true);
    try {
      const response = await fetch("/api/admin/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to }),
      });
      const json = await response.json();
      if (!response.ok) {
        setMessage(json.error || "Test email failed");
        return;
      }
      setMessage(`Test email sent to ${json.to}. Check your inbox (and spam).`);
    } catch {
      setMessage("Test email failed");
    } finally {
      setSendingTestEmail(false);
    }
  }

  return (
    <>
    <HowTo title="How ticket email works" defaultOpen={!data.emailConfigured}>
      <p>Email is optional, but needed if you want guests to receive ticket codes automatically.</p>
      <ol className="list-decimal space-y-1 pl-5">
        <li>Add Gmail env vars in Vercel, then redeploy.</li>
        <li>Send a test email from this page.</li>
        <li>Import guests with <strong>Email ticket codes on import</strong>, or click Email next to one guest.</li>
      </ol>
    </HowTo>
    <AdminPanel
      title="Ticket email (Gmail)"
      description="Automatically email ticket codes when you import guests."
      action={
        <StatusBadge tone={data.emailConfigured ? "success" : "warning"}>
          {data.emailConfigured ? "Configured" : "Not configured"}
        </StatusBadge>
      }
    >
      {data.emailConfigured ? (
        <div className="space-y-4 text-sm text-pine">
          <p>
            Sending as <strong>{data.email?.fromName}</strong>
            {data.email?.gmailUser ? ` (${data.email.gmailUser})` : ""} · Links use{" "}
            <strong>{data.email?.appUrl}</strong>
          </p>
          <form onSubmit={sendTestEmail} className="flex flex-wrap items-end gap-3">
            <AdminField label="Send test email to" className="min-w-[14rem] flex-1">
              <input
                type="email"
                value={testEmailTo}
                onChange={(e) => setTestEmailTo(e.target.value)}
                placeholder="you@gmail.com"
                className={inputClassName}
              />
            </AdminField>
            <AdminButton type="submit" disabled={sendingTestEmail}>
              {sendingTestEmail ? "Sending…" : "Send test"}
            </AdminButton>
          </form>
        </div>
      ) : (
        <div className="space-y-4 text-sm text-pine">
          <p>Add these in <strong>Vercel → Settings → Environment Variables</strong>, then redeploy:</p>
          <pre className="overflow-x-auto rounded-xl bg-mist/80 p-4 font-mono text-xs text-ink">
{`GMAIL_USER=vonettastevenson@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
APP_URL=https://event-vault-dusky.vercel.app
EMAIL_FROM_NAME=Koinonia Retreat`}
          </pre>
          <ol className="list-decimal space-y-2 pl-5">
            <li>Turn on <strong>2-Step Verification</strong> on the Google account.</li>
            <li>
              Create an App Password at{" "}
              <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="underline">
                myaccount.google.com/apppasswords
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </li>
            <li>Redeploy Vercel, refresh this page, then send a test email.</li>
          </ol>
        </div>
      )}
    </AdminPanel>
    </>
  );
}
