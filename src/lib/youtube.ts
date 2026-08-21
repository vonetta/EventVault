export type YouTubeRef =
  | { type: "video"; id: string }
  | { type: "playlist"; id: string };

function isVideoId(id: string) {
  return /^[\w-]{11}$/.test(id);
}

function isPlaylistId(id: string) {
  // Common playlist id prefixes: PL, UU, LL, FL, OL, RD, SD, …
  return /^[\w-]{12,}$/.test(id);
}

/** Extract a YouTube video id from common URL shapes or a bare id. */
export function parseYouTubeId(input: string): string | null {
  const ref = parseYouTubeRef(input);
  return ref?.type === "video" ? ref.id : null;
}

/** Extract a YouTube playlist id from common URL shapes or a bare id. */
export function parseYouTubePlaylistId(input: string): string | null {
  const ref = parseYouTubeRef(input);
  return ref?.type === "playlist" ? ref.id : null;
}

/**
 * Parse a YouTube video or playlist URL/id.
 * Playlist URLs (playlist?list= / watch?list=) win when a list id is present
 * without requiring a single-video-only path.
 */
export function parseYouTubeRef(input: string): YouTubeRef | null {
  const raw = input.trim();
  if (!raw) return null;

  if (isVideoId(raw)) return { type: "video", id: raw };
  if (/^(PL|UU|LL|FL|OL|RD|SD)[\w-]{10,}$/i.test(raw)) {
    return { type: "playlist", id: raw };
  }

  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, "");
    const list = url.searchParams.get("list");

    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      if (list && isPlaylistId(list) && url.searchParams.get("v") == null) {
        return { type: "playlist", id: list };
      }
      // youtu.be/VIDEO?list=PLAYLIST → treat as playlist player starting at that list
      if (list && isPlaylistId(list)) return { type: "playlist", id: list };
      return id && isVideoId(id) ? { type: "video", id } : null;
    }

    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      const parts = url.pathname.split("/").filter(Boolean);

      if (parts[0] === "playlist" && list && isPlaylistId(list)) {
        return { type: "playlist", id: list };
      }

      // Explicit playlist page or watch URL with list= → playlist embed
      if (list && isPlaylistId(list) && (parts[0] === "watch" || parts[0] === "embed" || !parts.length)) {
        // Pure playlist intent: /watch?list=PL… or /embed/videoseries?list=
        if (!url.searchParams.get("v") || parts[0] === "playlist") {
          return { type: "playlist", id: list };
        }
        // watch?v=…&list=… — use playlist so guests can advance through sessions
        return { type: "playlist", id: list };
      }

      if (url.pathname === "/watch") {
        const id = url.searchParams.get("v");
        return id && isVideoId(id) ? { type: "video", id } : null;
      }

      if (parts[0] === "embed") {
        if (parts[1] === "videoseries" && list && isPlaylistId(list)) {
          return { type: "playlist", id: list };
        }
        const id = parts[1];
        return id && isVideoId(id) ? { type: "video", id } : null;
      }

      if (parts[0] === "shorts" || parts[0] === "live") {
        const id = parts[1];
        return id && isVideoId(id) ? { type: "video", id } : null;
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function youtubeWatchUrl(id: string) {
  return `https://www.youtube.com/watch?v=${id}`;
}

export function youtubePlaylistUrl(id: string) {
  return `https://www.youtube.com/playlist?list=${id}`;
}

export function youtubeEmbedUrl(id: string) {
  return `https://www.youtube.com/embed/${id}`;
}

export function youtubePlaylistEmbedUrl(playlistId: string) {
  return `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(playlistId)}`;
}

export function youtubeEmbedForRef(ref: YouTubeRef) {
  return ref.type === "playlist"
    ? youtubePlaylistEmbedUrl(ref.id)
    : youtubeEmbedUrl(ref.id);
}

export function youtubeOpenUrlForRef(ref: YouTubeRef) {
  return ref.type === "playlist" ? youtubePlaylistUrl(ref.id) : youtubeWatchUrl(ref.id);
}

export function isMediaAvailable(availableUntil?: Date | string | null) {
  if (!availableUntil) return true;
  const end = availableUntil instanceof Date ? availableUntil : new Date(availableUntil);
  if (Number.isNaN(end.getTime())) return true;
  return end.getTime() > Date.now();
}
