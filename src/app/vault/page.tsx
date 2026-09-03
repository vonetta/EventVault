"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MediaGrid, type MediaItem } from "@/components/MediaGrid";

type SessionItem = {
  id: string;
  title: string;
  speaker: string;
  startsAt: string;
  description: string;
  videos: MediaItem[];
};

type DayItem = {
  id: string;
  label: string;
  date: string;
  sessions: SessionItem[];
};

type Library = {
  guest: { name: string; tier: "vip" | "standard" };
  event: { name: string; description?: string };
  groupGallery: MediaItem[];
  eventGallery: MediaItem[];
  personalPhotos: MediaItem[];
  days: DayItem[];
  preview?: boolean;
};

function photoCount(items: MediaItem[]) {
  return items.filter((item) => item.provider !== "youtube").length;
}

export default function VaultPage() {
  const router = useRouter();
  const [data, setData] = useState<Library | null>(null);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [downloadMessage, setDownloadMessage] = useState("");

  useEffect(() => {
    async function load() {
      const response = await fetch("/api/guest/library");
      if (response.status === 401) {
        router.replace("/");
        return;
      }
      const json = await response.json();
      if (!response.ok) {
        setError(json.error || "Could not load vault");
        return;
      }
      setData(json);
    }
    load();
  }, [router]);

  async function logout() {
    if (data?.preview) {
      await fetch("/api/admin/exit-preview", { method: "POST" });
      window.location.assign("/admin");
      return;
    }
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/");
  }

  async function downloadAll() {
    setDownloading(true);
    setDownloadMessage("Preparing a ZIP of your photos…");
    try {
      const response = await fetch("/api/guest/download");
      if (response.status === 401) {
        router.replace("/");
        return;
      }
      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        setDownloadMessage(json.error || "Could not prepare your download");
        return;
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] || "eventvault-photos.zip";
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setDownloadMessage("Saved to your downloads folder.");
    } catch {
      setDownloadMessage("Could not prepare your download");
    } finally {
      setDownloading(false);
    }
  }

  if (error) {
    return (
      <main id="main" tabIndex={-1} className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-red-700">{error}</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main id="main" tabIndex={-1} className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-8 md:px-10 md:py-12">
        <p className="font-[family-name:var(--font-fraunces)] text-3xl text-ink">EventVault</p>
        <p role="status" className="text-pine">Opening your vault…</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="aspect-[4/3] animate-pulse rounded-2xl bg-white" />
          ))}
        </div>
      </main>
    );
  }

  const isVip = data.guest.tier === "vip";
  const personalCount = photoCount(data.personalPhotos);
  const eventCount = photoCount(data.eventGallery || []);
  const groupCount = photoCount(data.groupGallery);
  const zipCount = personalCount + eventCount + groupCount;
  const firstName = data.guest.name.trim().split(/\s+/)[0] || data.guest.name;
  const sessionCount = data.days.reduce((sum, day) => sum + day.sessions.length, 0);
  const showJumpNav = personalCount > 0 || eventCount > 0 || groupCount > 0 || sessionCount > 0;

  return (
    <main id="main" tabIndex={-1} className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-6 py-8 md:px-10 md:py-12">
      {data.preview ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-[color:var(--line)] bg-white px-4 py-3 text-sm text-ink">
          <span>
            <strong>Admin preview</strong> — you are viewing the vault as{" "}
            <strong>{data.guest.name}</strong> ({data.guest.tier.toUpperCase()})
          </span>
          <button
            type="button"
            onClick={logout}
            className="rounded-full bg-ink px-4 py-2 text-foam"
          >
            Back to admin
          </button>
        </div>
      ) : null}

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-[family-name:var(--font-fraunces)] text-3xl text-ink">EventVault</p>
          <h1 className="mt-3 font-[family-name:var(--font-fraunces)] text-4xl text-ink">
            Welcome, {firstName}
          </h1>
          <p className="mt-2 text-pine">
            {data.event.name}
            {isVip ? " · Your photos, sessions, and galleries" : " · Event and group galleries"}
          </p>
          {data.event.description ? (
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-pine">
              {data.event.description}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={downloadAll}
            disabled={downloading || zipCount === 0}
            className="rounded-full bg-ink px-4 py-2 text-sm text-foam disabled:cursor-not-allowed disabled:opacity-50"
          >
            {downloading
              ? "Preparing ZIP…"
              : zipCount === 0
                ? "Photos coming soon"
                : isVip
                  ? `Download all ${zipCount} photos`
                  : `Download gallery (${zipCount})`}
          </button>
          <button
            type="button"
            onClick={logout}
            className="rounded-full border border-[color:var(--line)] bg-white/70 px-4 py-2 text-sm text-pine"
          >
            {data.preview ? "Back to admin" : "Sign out"}
          </button>
        </div>
      </header>

      <p role="status" aria-live="polite" className={downloadMessage ? "text-sm text-pine" : "sr-only"}>
        {downloadMessage}
      </p>

      {showJumpNav ? (
        <nav aria-label="Vault sections" className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-pine">
          {isVip ? (
            <a href="#personal-photos" className="underline-offset-4 hover:underline">
              Your photos{personalCount ? ` (${personalCount})` : ""}
            </a>
          ) : null}
          {isVip && sessionCount ? (
            <a href="#speaker-sessions" className="underline-offset-4 hover:underline">
              Sessions
            </a>
          ) : null}
          <a href="#event-gallery" className="underline-offset-4 hover:underline">
            Event gallery{eventCount ? ` (${eventCount})` : ""}
          </a>
          <a href="#group-gallery" className="underline-offset-4 hover:underline">
            Group gallery{groupCount ? ` (${groupCount})` : ""}
          </a>
        </nav>
      ) : null}

      {isVip ? (
        <section id="personal-photos" className="space-y-4 scroll-mt-6">
          <h2 className="font-[family-name:var(--font-fraunces)] text-2xl text-ink">
            Your photos
            {personalCount ? <span className="ml-2 text-lg text-pine">{personalCount}</span> : null}
          </h2>
          <p className="text-sm text-pine">Tap a photo to view it larger, or download one at a time.</p>
          <MediaGrid
            items={data.personalPhotos}
            showDownload
            showCaptions={false}
            emptyMessage="Your personal photos will appear here when they’re ready."
          />
        </section>
      ) : null}

      {isVip && data.days.length ? (
        <section id="speaker-sessions" className="space-y-8 scroll-mt-6">
          <h2 className="font-[family-name:var(--font-fraunces)] text-2xl text-ink">
            Speaker sessions
          </h2>
          {data.days.map((day) => (
            <div key={day.id} className="space-y-4">
              <h3 className="text-lg font-semibold text-pine">{day.label}</h3>
              <div className="space-y-4">
                {day.sessions.map((session) => (
                  <article
                    key={session.id}
                    className="rounded-2xl border border-[color:var(--line)] bg-white/70 p-4"
                  >
                    <h4 className="text-lg text-ink">{session.title}</h4>
                    <p className="text-sm text-pine">
                      {[session.speaker, session.startsAt].filter(Boolean).join(" · ")}
                    </p>
                    {session.description ? (
                      <p className="mt-2 text-sm text-pine">{session.description}</p>
                    ) : null}
                    <div className="mt-4">
                      <MediaGrid
                        items={session.videos}
                        emptyMessage="This session’s video will appear here when it’s linked."
                      />
                    </div>
                  </article>
                ))}
                {!day.sessions.length ? (
                  <p className="text-sm text-pine">Sessions for this day will appear here.</p>
                ) : null}
              </div>
            </div>
          ))}
        </section>
      ) : null}

      <section id="event-gallery" className="space-y-4 scroll-mt-6">
        <h2 className="font-[family-name:var(--font-fraunces)] text-2xl text-ink">
          Event gallery
          {eventCount ? <span className="ml-2 text-lg text-pine">{eventCount}</span> : null}
        </h2>
        <p className="text-sm text-pine">Photos from the event for every guest. Not assigned to VIP or the group album.</p>
        <MediaGrid
          items={data.eventGallery || []}
          showDownload
          showCaptions={false}
          emptyMessage="Event gallery photos will appear here after they’re uploaded."
        />
      </section>

      <section id="group-gallery" className="space-y-4 scroll-mt-6">
        <h2 className="font-[family-name:var(--font-fraunces)] text-2xl text-ink">
          Group gallery
          {groupCount ? <span className="ml-2 text-lg text-pine">{groupCount}</span> : null}
        </h2>
        <MediaGrid
          items={data.groupGallery}
          showDownload
          showCaptions={false}
          emptyMessage="The group gallery will appear here after photos are uploaded."
        />
      </section>

      {!isVip ? (
        <p className="text-sm text-pine">
          This ticket includes the event gallery and group gallery. Personal photos and speaker sessions are part of VIP access.
        </p>
      ) : null}

      <details className="border-t border-[color:var(--line)] pt-6">
        <summary className="cursor-pointer text-sm font-medium text-pine">Account details</summary>
        <div className="mt-3 grid gap-2 text-sm text-pine">
          <p><strong className="text-ink">Name:</strong> {data.guest.name}</p>
          <p><strong className="text-ink">Access:</strong> {data.guest.tier === "vip" ? "VIP" : "Standard"}</p>
          <p className="text-xs text-pine">Contact the event organizer to update your details.</p>
        </div>
      </details>
    </main>
  );
}
