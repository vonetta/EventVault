export type MediaItem = {
  id: string;
  title: string;
  contentType: string;
  url: string;
  provider?: "file" | "youtube";
  embedUrl?: string;
  availableUntil?: string | null;
};

type MediaGridProps = {
  items: MediaItem[];
  emptyMessage?: string;
  onRemove?: (id: string) => void;
};

export function MediaGrid({
  items,
  emptyMessage = "Nothing here yet.",
  onRemove,
}: MediaGridProps) {
  if (!items.length) {
    return <p className="text-sm text-pine/70">{emptyMessage}</p>;
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
              className="relative overflow-hidden rounded-2xl border border-[color:var(--line)] bg-white/70"
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
              {onRemove ? (
                <button
                  type="button"
                  onClick={() => onRemove(item.id)}
                  className="absolute right-2 top-2 rounded-full bg-ink/80 px-2 py-1 text-xs text-foam"
                >
                  Remove
                </button>
              ) : null}
            </div>
          );
        }

        return (
          <div
            key={item.id}
            className="relative overflow-hidden rounded-2xl border border-[color:var(--line)] bg-white/70 transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <a href={item.url} target="_blank" rel="noreferrer" className="block">
              {item.contentType.startsWith("video/") ? (
                <video className="aspect-video w-full bg-ink/90 object-cover" src={item.url} controls />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="aspect-[4/3] w-full object-cover" src={item.url} alt={item.title} />
              )}
              <div className="px-3 py-2 text-sm text-pine">{item.title}</div>
            </a>
            {onRemove ? (
              <button
                type="button"
                onClick={() => onRemove(item.id)}
                className="absolute right-2 top-2 rounded-full bg-ink/80 px-2 py-1 text-xs text-foam"
              >
                Remove
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
