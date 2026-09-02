"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

function HomePageContent() {
  const searchParams = useSearchParams();
  const [ticketCode, setTicketCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showResend, setShowResend] = useState(false);
  const [resendEmail, setResendEmail] = useState("");
  const [resendMessage, setResendMessage] = useState("");
  const [resendLoading, setResendLoading] = useState(false);

  useEffect(() => {
    const fromQuery = searchParams.get("ticket");
    if (fromQuery) {
      setTicketCode(fromQuery.trim().toUpperCase());
    }
  }, [searchParams]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketCode }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Could not open vault");
        return;
      }
      window.location.assign("/vault");
      return;
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function onResend(event: FormEvent) {
    event.preventDefault();
    setResendLoading(true);
    setResendMessage("");
    setError("");

    try {
      const response = await fetch("/api/auth/resend-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resendEmail }),
      });
      const data = await response.json();
      if (!response.ok) {
        setResendMessage(data.error || "Could not send email");
        return;
      }
      setResendMessage(data.message || "Check your inbox for your ticket code.");
      setResendEmail("");
    } catch {
      setResendMessage("Something went wrong. Try again.");
    } finally {
      setResendLoading(false);
    }
  }

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8 md:px-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[70vh] opacity-80"
        style={{
          backgroundImage:
            "linear-gradient(180deg, rgba(16,36,31,0.55), rgba(16,36,31,0.15) 55%, transparent), url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22160%22 height=%22160%22 viewBox=%220 0 160 160%22%3E%3Cpath fill=%22%231c3d34%22 fill-opacity=%220.05%22 d=%22M0 160L160 0H80L0 80zm160 0V80L80 160z%22/%3E%3C/svg%3E')",
          backgroundSize: "cover, 160px 160px",
        }}
      />

      <header className="flex items-center justify-between">
        <p className="font-[family-name:var(--font-fraunces)] text-3xl tracking-tight text-ink md:text-4xl">
          EventVault
        </p>
        <a
          href="/admin/login"
          className="text-sm text-pine/80 underline-offset-4 hover:underline"
        >
          Admin
        </a>
      </header>

      <section className="mt-20 flex flex-1 flex-col justify-center gap-10 md:mt-28 md:max-w-xl">
        <div className="space-y-4">
          <h1 className="font-[family-name:var(--font-fraunces)] text-4xl leading-tight text-ink md:text-5xl">
            Your event media, unlocked by ticket.
          </h1>
          <p className="max-w-md text-lg leading-relaxed text-pine/80">
            Enter the code you received to open your personal photos and the media
            included with your ticket.
          </p>
        </div>

        <form onSubmit={onSubmit} className="flex w-full max-w-md flex-col gap-3">
          <label className="text-sm font-medium text-pine" htmlFor="ticket">
            Ticket code
          </label>
          <input
            id="ticket"
            value={ticketCode}
            onChange={(e) => setTicketCode(e.target.value)}
            placeholder="EV-XXXXXXXX"
            autoComplete="off"
            className="h-14 rounded-2xl border border-[color:var(--line)] bg-white/80 px-4 tracking-[0.18em] text-ink outline-none ring-gold/40 placeholder:tracking-normal placeholder:text-pine/40 focus:ring-2"
          />
          <button
            type="submit"
            disabled={loading}
            className="h-14 rounded-2xl bg-ink px-5 text-foam transition hover:bg-pine disabled:opacity-60"
          >
            {loading ? "Opening…" : "Open my vault"}
          </button>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
        </form>

        <div className="w-full max-w-md">
          <button
            type="button"
            onClick={() => setShowResend((open) => !open)}
            className="text-sm text-pine/80 underline-offset-4 hover:underline"
          >
            {showResend ? "Hide" : "Lost your ticket code?"}
          </button>

          {showResend ? (
            <form onSubmit={onResend} className="mt-4 flex flex-col gap-3 rounded-2xl border border-[color:var(--line)] bg-white/70 p-4">
              <p className="text-sm text-pine/80">
                Enter the email address on your guest list. We&apos;ll resend your ticket code.
              </p>
              <label className="text-sm font-medium text-pine" htmlFor="resend-email">
                Email address
              </label>
              <input
                id="resend-email"
                type="email"
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
                placeholder="you@email.com"
                required
                className="h-12 rounded-xl border border-[color:var(--line)] bg-white/80 px-4 text-ink outline-none ring-gold/40 focus:ring-2"
              />
              <button
                type="submit"
                disabled={resendLoading}
                className="h-12 rounded-xl border border-pine/20 bg-mist/60 px-4 text-ink transition hover:bg-mist disabled:opacity-60"
              >
                {resendLoading ? "Sending…" : "Resend my code"}
              </button>
              {resendMessage ? (
                <p className="text-sm text-pine">{resendMessage}</p>
              ) : null}
            </form>
          ) : null}
        </div>
      </section>
    </main>
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-6">
          <p className="text-pine/70">Loading…</p>
        </main>
      }
    >
      <HomePageContent />
    </Suspense>
  );
}
