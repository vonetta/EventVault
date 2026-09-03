export type EventDoc = {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  startsOn?: string;
  endsOn?: string;
};

export type DayDoc = { _id: string; label: string; sortOrder: number };

export type SessionDoc = {
  _id: string;
  dayId: string;
  title: string;
  speaker?: string;
  startsAt?: string;
};

export type GuestDoc = {
  _id: string;
  name: string;
  email?: string;
  tier: "vip" | "standard";
  ticketCode: string;
};

export type MediaDoc = {
  _id: string;
  kind: string;
  title?: string;
  filename: string;
  contentType?: string;
  guestId?: string | null;
  sessionId?: string | null;
  storageProvider?: string;
  youtubeId?: string;
  youtubePlaylistId?: string;
  availableUntil?: string | null;
};

export type MediaFilter = "all" | "group_photo" | "personal_photo" | "session_video";

export type AdminData = {
  event: EventDoc | null;
  events: EventDoc[];
  days: DayDoc[];
  sessions: SessionDoc[];
  guests: GuestDoc[];
  media: MediaDoc[];
  emailConfigured?: boolean;
  email?: {
    configured: boolean;
    appUrl: string;
    fromName: string;
    gmailUser: string | null;
  };
};

export type AdminActions = {
  postAction: (payload: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
  load: (eventId?: string) => Promise<void>;
  setMessage: (msg: string) => void;
};
