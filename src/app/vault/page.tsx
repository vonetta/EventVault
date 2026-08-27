"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type MediaItem = {
  id: string;
  title: string;
  contentType: string;
  url: string;
  provider?: "file" | "youtube";
  embedUrl?: string;
  availableUntil?: string | null;
};

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
  personalPhotos: MediaItem[];
  days: DayItem[];
};

function MediaGrid({ items }: { items: MediaItem[] }) {
  if (!items.length) {
    return <p className="text-sm text-pine/70">Nothing here yet.</p>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => {
        const isYouTube =
          item.provider === "youtube" ||
          item.contentType === "video/youtube" ||
          item.contentType === "video/youtube-playlist";
        if (isYouTube && item.embedUrl) {
          return (
            <div
              key={item.id}
              className="overflow-hidden rounded-2xl border border-[color:var(--line)] bg-white/70"
            >
              <div className="aspect-video w-full bg-ink/90">
                <iframe
                  className="h-full w-full"
                  src={item.embedUrl}
                  title={item.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
              <div className="px-3 py-2 text-sm text-pine">
                {item.title}
                {item.availableUntil ? (
                  <span className="mt-1 block text-xs text-pine/60">
                    Available until {new Date(item.availableUntil).toLocaleDateString()}
                  </span>
                ) : null}
              </div>
            </div>
          );
        }

        return (
          <a
            key={item.id}
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="overflow-hidden rounded-2xl border border-[color:var(--line)] bg-white/70 transition hover:-translate-y-0.5 hover:shadow-md"
          >
            {item.contentType.startsWith("video/") ? (
              <video className="aspect-video w-full bg-ink/90 object-cover" src={item.url} controls />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="aspect-[4/3] w-full object-cover" src={item.url} alt={item.title} />
            )}
            <div className="px-3 py-2 text-sm text-pine">{item.title}</div>
          </a>
        );
      })}
    </div>
  );
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
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/");
  }

  async function downloadAll() {
    setDownloading(true);
    setDownloadMessage("");
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
      setDownloadMessage("Download started.");
    } catch {
      setDownloadMessage("Could not prepare your download");
    } finally {
      setDownloading(false);
    }
  }

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-red-700">{error}</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-pine/70">Opening your vault…</p>
      </main>
    );
  }

  const isVip = data.guest.tier === "vip";
  const photoCount =
    data.groupGallery.filter((item) => item.provider !== "youtube").length +
    data.personalPhotos.filter((item) => item.provider !== "youtube").length;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-6 py-8 md:px-10 md:py-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-[family-name:var(--font-fraunces)] text-3xl text-ink">EventVault</p>
          <h1 className="mt-3 font-[family-name:var(--font-fraunces)] text-4xl text-ink">
            Welcome, {data.guest.name}
          </h1>
          <p className="mt-2 text-pine/80">
            {data.event.name}
            {isVip ? " · VIP access" : " · Group gallery access"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={downloadAll}
            disabled={downloading || photoCount === 0}
            className="rounded-full bg-ink px-4 py-2 text-sm text-foam disabled:cursor-not-allowed disabled:opacity-50"
          >
            {downloading
              ? "Preparing ZIP…"
              : isVip
                ? "Download all photos"
                : "Download group gallery"}
          </button>
          <button
            onClick={logout}
            className="rounded-full border border-[color:var(--line)] bg-white/70 px-4 py-2 text-sm text-pine"
          >
            Sign out
          </button>
        </div>
      </header>

      {downloadMessage ? (
        <p className="text-sm text-pine/80">{downloadMessage}</p>
      ) : null}

      <section className="space-y-4">
        <h2 className="font-[family-name:var(--font-fraunces)] text-2xl text-ink">Group gallery</h2>
        <MediaGrid items={data.groupGallery} />
      </section>

      {isVip ? (
        <>
          <section className="space-y-4">
            <h2 className="font-[family-name:var(--font-fraunces)] text-2xl text-ink">
              Your personal photos
            </h2>
            <MediaGrid items={data.personalPhotos} />
          </section>

          <section className="space-y-8">
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
                      <p className="text-sm text-pine/75">
                        {[session.speaker, session.startsAt].filter(Boolean).join(" · ")}
                      </p>
                      {session.description ? (
                        <p className="mt-2 text-sm text-pine/80">{session.description}</p>
                      ) : null}
                      <div className="mt-4">
                        <MediaGrid items={session.videos} />
                      </div>
                    </article>
                  ))}
                  {!day.sessions.length ? (
                    <p className="text-sm text-pine/70">Sessions coming soon.</p>
                  ) : null}
                </div>
              </div>
            ))}
          </section>
        </>
      ) : (
        <section className="rounded-2xl border border-[color:var(--line)] bg-white/60 p-5 text-pine/80">
          Personal photos and full speaker sessions are included with VIP tickets.
        </section>
      )}
    </main>
  );
}
