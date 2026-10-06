"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

const VISUAL_VESSELS_URL = "https://www.instagram.com/visualvessels/";

function normalizeTicketInput(value: string) {
  return value.toUpperCase().replace(/\s+/g, "");
}

function ticketFromAddressBar() {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get("ticket");
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  const fromHash = new URLSearchParams(hash).get("t");
  return fromHash || fromQuery || "";
}

function stripTicketFromAddressBar() {
  window.history.replaceState(null, "", window.location.pathname);
}

export default function HomePage() {
  const [ticketCode, setTicketCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [openingFromLink, setOpeningFromLink] = useState(false);
  const [showResend, setShowResend] = useState(false);
  const [resendEmail, setResendEmail] = useState("");
  const [resendMessage, setResendMessage] = useState("");
  const [resendLoading, setResendLoading] = useState(false);
  const autoTried = useRef(false);

  async function openVault(code: string) {
    const ticket = normalizeTicketInput(code);
    if (!ticket) {
      setError("Enter the ticket code from your email.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketCode: ticket }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(
          data.error === "Invalid ticket code"
            ? "That code wasn’t found. Check the email, or use Lost your ticket code below."
            : data.error || "Could not open vault",
        );
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

  useEffect(() => {
    if (autoTried.current) return;
    const raw = ticketFromAddressBar();
    if (!raw) return;
    autoTried.current = true;
    stripTicketFromAddressBar();
    let decoded = raw;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      decoded = raw;
    }
    const normalized = normalizeTicketInput(decoded);
    setTicketCode(normalized);
    setOpeningFromLink(true);
    void openVault(normalized).finally(() => setOpeningFromLink(false));
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    await openVault(ticketCode);
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

  const openingFromLinkAndBusy = openingFromLink && loading && !error;
  const looksLikeGalleryCode = ticketCode.startsWith("WE-");

  return (
    <main
      id="main"
      tabIndex={-1}
      className="home-shell relative flex min-h-screen flex-col overflow-hidden text-[color:var(--home-foam)]"
    >
      <div aria-hidden className="home-atmosphere">
        <div className="home-atmosphere__base" />
        <div className="home-atmosphere__beam" />
        <div className="home-atmosphere__grain" />
        <div className="home-atmosphere__frames">
          <span className="home-frame home-frame--a" />
          <span className="home-frame home-frame--b" />
          <span className="home-frame home-frame--c" />
        </div>
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-7 md:px-10 md:py-9">
        <header className="flex items-center justify-end home-rise" style={{ animationDelay: "80ms" }}>
          <a
            href="/admin/login"
            className="text-sm text-[color:var(--home-mist)]/70 underline-offset-4 transition hover:text-[color:var(--home-mist)] hover:underline"
          >
            Admin
          </a>
        </header>

        <section className="flex flex-1 flex-col justify-center py-10 md:py-16">
          <div className="home-rise max-w-3xl" style={{ animationDelay: "120ms" }}>
            <p className="home-brand font-[family-name:var(--font-fraunces)] tracking-tight">
              EventVault
            </p>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-[color:var(--home-mist)]/85 md:text-xl">
              {looksLikeGalleryCode
                ? "This gallery code opens the free Whole-event album — highlights, the full weekend, and keepers you can save."
                : "Private photos from your event, waiting behind your ticket."}
            </p>
          </div>

          <div className="home-rise mt-10 w-full max-w-md" style={{ animationDelay: "280ms" }}>
            {openingFromLinkAndBusy ? (
              <p role="status" className="text-lg text-[color:var(--home-mist)]">
                {looksLikeGalleryCode ? "Opening the weekend…" : "Opening your vault…"}
              </p>
            ) : (
              <>
                <form onSubmit={onSubmit} className="flex flex-col gap-3">
                  <label
                    className="text-sm font-medium text-[color:var(--home-mist)]/80"
                    htmlFor="ticket"
                  >
                    {looksLikeGalleryCode ? "Gallery code" : "Ticket code"}
                  </label>
                  <input
                    id="ticket"
                    value={ticketCode}
                    onChange={(e) => setTicketCode(normalizeTicketInput(e.target.value))}
                    placeholder={looksLikeGalleryCode ? "WE-XXXXXXXX" : "EV-XXXXXXXX"}
                    autoComplete="off"
                    autoCapitalize="characters"
                    autoFocus
                    spellCheck={false}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? "ticket-error" : undefined}
                    className="h-14 rounded-xl border border-white/15 bg-black/25 px-4 tracking-[0.18em] text-[color:var(--home-foam)] outline-none backdrop-blur-sm placeholder:tracking-normal placeholder:text-[color:var(--home-mist)]/45 focus:border-[color:var(--home-amber)]/50 focus:ring-2 focus:ring-[color:var(--home-amber)]/25"
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="home-cta h-14 rounded-xl bg-[color:var(--home-amber)] px-5 font-medium text-[color:var(--home-ink)] transition hover:bg-[color:var(--home-amber-bright)] disabled:opacity-60"
                  >
                    {loading
                      ? "Opening…"
                      : looksLikeGalleryCode
                        ? "Enter the weekend"
                        : "Open my vault"}
                  </button>
                  {error ? (
                    <p id="ticket-error" role="alert" className="text-sm text-red-300">
                      {error}
                    </p>
                  ) : null}
                </form>

                {!looksLikeGalleryCode ? (
                  <div className="mt-5">
                    <button
                      type="button"
                      onClick={() => setShowResend((open) => !open)}
                      className="text-sm text-[color:var(--home-mist)]/70 underline-offset-4 transition hover:text-[color:var(--home-mist)] hover:underline"
                      aria-expanded={showResend}
                      aria-controls="resend-form"
                    >
                      {showResend ? "Hide" : "Lost your ticket code?"}
                    </button>

                    {showResend ? (
                      <form
                        id="resend-form"
                        onSubmit={onResend}
                        className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-4"
                      >
                        <p className="text-sm text-[color:var(--home-mist)]/75">
                          Enter the email on your guest list. We&apos;ll resend your ticket code.
                        </p>
                        <label
                          className="text-sm font-medium text-[color:var(--home-mist)]/80"
                          htmlFor="resend-email"
                        >
                          Email address
                        </label>
                        <input
                          id="resend-email"
                          type="email"
                          value={resendEmail}
                          onChange={(e) => setResendEmail(e.target.value)}
                          placeholder="you@email.com"
                          required
                          autoComplete="email"
                          className="h-12 rounded-xl border border-white/15 bg-black/25 px-4 text-[color:var(--home-foam)] outline-none backdrop-blur-sm placeholder:text-[color:var(--home-mist)]/45 focus:border-[color:var(--home-amber)]/50 focus:ring-2 focus:ring-[color:var(--home-amber)]/25"
                        />
                        <button
                          type="submit"
                          disabled={resendLoading}
                          className="h-12 rounded-xl border border-white/20 bg-white/5 px-4 text-[color:var(--home-foam)] transition hover:bg-white/10 disabled:opacity-60"
                        >
                          {resendLoading ? "Sending…" : "Resend my code"}
                        </button>
                        {resendMessage ? (
                          <p role="status" className="text-sm text-[color:var(--home-mist)]">
                            {resendMessage}
                          </p>
                        ) : null}
                      </form>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-5 text-sm text-[color:var(--home-mist)]/70">
                    Have a personal VIP ticket too? Use that code instead for Photos of you.
                  </p>
                )}
              </>
            )}
          </div>
        </section>

        <footer className="home-rise flex flex-col gap-2 border-t border-white/10 pt-5 text-sm text-[color:var(--home-mist)]/65 sm:flex-row sm:items-center sm:justify-between" style={{ animationDelay: "420ms" }}>
          <p>
            A{" "}
            <a
              href={VISUAL_VESSELS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[color:var(--home-mist)] underline-offset-4 transition hover:text-[color:var(--home-amber)] hover:underline"
            >
              Visual Vessels
            </a>{" "}
            experience
          </p>
          <p className="text-[color:var(--home-mist)]/45">Private event media delivery</p>
        </footer>
      </div>
    </main>
  );
}
