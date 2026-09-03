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
  personalPhotos: MediaItem[];
  days: DayItem[];
  preview?: boolean;
};

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
      <main id="main" tabIndex={-1} className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-red-700">{error}</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main id="main" tabIndex={-1} className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-pine">Opening your vault…</p>
      </main>
    );
  }

  const isVip = data.guest.tier === "vip";
  const photoCount =
    data.groupGallery.filter((item) => item.provider !== "youtube").length +
    data.personalPhotos.filter((item) => item.provider !== "youtube").length;

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
            Welcome, {data.guest.name}
          </h1>
          <p className="mt-2 text-pine">
            {data.event.name}
            {isVip ? " · VIP access" : " · Group gallery access"}
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
            type="button"
            onClick={logout}
            className="rounded-full border border-[color:var(--line)] bg-white/70 px-4 py-2 text-sm text-pine"
          >
            {data.preview ? "Back to admin" : "Sign out"}
          </button>
        </div>
      </header>

      {downloadMessage ? (
        <p role="status" aria-live="polite" className="text-sm text-pine">
          {downloadMessage}
        </p>
      ) : null}

      <details className="rounded-2xl border border-[color:var(--line)] bg-white/60 p-4">
        <summary className="cursor-pointer text-sm font-medium text-pine">My profile</summary>
        <div className="mt-3 grid gap-2 text-sm text-pine">
          <p><strong className="text-ink">Name:</strong> {data.guest.name}</p>
          <p><strong className="text-ink">Tier:</strong> {data.guest.tier === "vip" ? "VIP" : "Standard"}</p>
          <p className="text-xs text-pine">Contact the event organizer to update your details.</p>
        </div>
      </details>

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
                      <p className="text-sm text-pine">
                        {[session.speaker, session.startsAt].filter(Boolean).join(" · ")}
                      </p>
                      {session.description ? (
                        <p className="mt-2 text-sm text-pine">{session.description}</p>
                      ) : null}
                      <div className="mt-4">
                        <MediaGrid items={session.videos} />
                      </div>
                    </article>
                  ))}
                  {!day.sessions.length ? (
                    <p className="text-sm text-pine">Sessions coming soon.</p>
                  ) : null}
                </div>
              </div>
            ))}
          </section>
        </>
      ) : (
        <section className="rounded-2xl border border-[color:var(--line)] bg-white/60 p-5 text-pine">
          Personal photos and full speaker sessions are included with VIP tickets.
        </section>
      )}
    </main>
  );
}
