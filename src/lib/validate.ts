import { z } from "zod";

export const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "Invalid id");

export const ticketLoginSchema = z.object({
  ticketCode: z.string().min(1).max(64),
});

export const adminLoginSchema = z.object({
  password: z.string().min(1).max(200),
});

export const guestImportRowSchema = z.object({
  name: z.string().min(1).max(120),
  email: z
    .string()
    .max(200)
    .default("")
    .refine((value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), {
      message: "Invalid email",
    }),
  tier: z.enum(["vip", "standard"]).default("standard"),
});

export const adminActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("bootstrap"),
    name: z.string().min(1).max(120).optional(),
    slug: z.string().min(1).max(120).optional(),
    description: z.string().max(500).optional(),
    days: z.array(z.string().min(1).max(40)).max(14).optional(),
  }),
  z.object({
    action: z.literal("create_event"),
    name: z.string().min(1).max(120),
    slug: z.string().min(1).max(120).optional(),
    description: z.string().max(500).optional(),
    days: z.array(z.string().min(1).max(40)).max(14).optional(),
  }),
  z.object({
    action: z.literal("add_session"),
    eventId: objectIdSchema,
    dayId: objectIdSchema,
    title: z.string().min(1).max(200),
    speaker: z.string().max(120).optional(),
    startsAt: z.string().max(80).optional(),
    description: z.string().max(1000).optional(),
    sortOrder: z.number().int().min(0).max(999).optional(),
  }),
  z.object({
    action: z.literal("import_guests"),
    eventId: objectIdSchema,
    guests: z.array(guestImportRowSchema).min(1).max(500),
    sendEmail: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("delete_guest"),
    guestId: objectIdSchema,
  }),
  z.object({
    action: z.literal("regenerate_code"),
    guestId: objectIdSchema,
  }),
  z.object({
    action: z.literal("email_ticket"),
    guestId: objectIdSchema,
  }),
  z.object({
    action: z.literal("delete_media"),
    mediaId: objectIdSchema,
  }),
  z.object({
    action: z.literal("add_youtube_session"),
    eventId: objectIdSchema,
    sessionId: objectIdSchema,
    youtubeUrl: z.string().min(5).max(500),
    title: z.string().max(200).optional(),
    availableUntil: z.string().max(40).optional(), // ISO date YYYY-MM-DD or datetime
  }),
]);

export const IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export const VIDEO_MIME = new Set(["video/mp4", "video/webm", "video/quicktime"]);

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
