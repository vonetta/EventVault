"use client";

import type { MediaItem } from "@/components/MediaGrid";

type GalleryOpeningProps = {
  eventName: string;
  hero?: MediaItem | null;
  photoCount: number;
  highlightCount: number;
  onEnter: () => void;
};

/**
 * First viewport for Whole event — brand + one CTA, not a wall of thumbs.
 */
export function GalleryOpening({
  eventName,
  hero,
  photoCount,
  highlightCount,
  onEnter,
}: GalleryOpeningProps) {
  return (
    <div className="ev-fade-in relative overflow-hidden rounded-3xl bg-ink text-foam">
      {hero ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={hero.url}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-55"
        />
      ) : (
        <div
          aria-hidden
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(ellipse at 30% 20%, rgba(250,250,249,0.25), transparent 55%), linear-gradient(160deg, #292524, #1c1917 60%, #44403c)",
          }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/55 to-ink/25" />

      <div className="relative flex min-h-[70vh] flex-col justify-end gap-6 px-6 py-10 sm:min-h-[62vh] sm:px-10 sm:py-14">
        <div className="max-w-xl space-y-3">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-foam/70">
            EventVault
          </p>
          <h2 className="font-[family-name:var(--font-fraunces)] text-4xl leading-tight sm:text-5xl">
            {eventName}
          </h2>
          <p className="max-w-md text-base leading-relaxed text-foam/85">
            {highlightCount
              ? `${highlightCount} highlights from the weekend, plus ${photoCount} photos in the full album.`
              : `${photoCount} photos from the weekend — browse at your pace.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onEnter}
            className="rounded-full bg-foam px-6 py-3 text-sm font-medium text-ink transition hover:bg-white"
          >
            Enter the weekend
          </button>
          <p className="text-xs text-foam/65">Swipe, save favorites, download keepers</p>
        </div>
      </div>
    </div>
  );
}
