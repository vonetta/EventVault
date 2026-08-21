import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const EventSchema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String, default: "" },
    startsOn: { type: String, default: "" },
    endsOn: { type: String, default: "" },
  },
  { timestamps: true },
);

const DaySchema = new Schema(
  {
    eventId: { type: Schema.Types.ObjectId, ref: "Event", required: true, index: true },
    label: { type: String, required: true },
    date: { type: String, default: "" },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

const SessionSchema = new Schema(
  {
    eventId: { type: Schema.Types.ObjectId, ref: "Event", required: true, index: true },
    dayId: { type: Schema.Types.ObjectId, ref: "Day", required: true, index: true },
    title: { type: String, required: true },
    speaker: { type: String, default: "" },
    startsAt: { type: String, default: "" },
    description: { type: String, default: "" },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

const GuestSchema = new Schema(
  {
    eventId: { type: Schema.Types.ObjectId, ref: "Event", required: true, index: true },
    name: { type: String, required: true },
    email: { type: String, default: "" },
    tier: { type: String, enum: ["vip", "standard"], required: true, default: "standard" },
    ticketCode: { type: String, required: true, unique: true, index: true },
  },
  { timestamps: true },
);

const MediaSchema = new Schema(
  {
    eventId: { type: Schema.Types.ObjectId, ref: "Event", required: true, index: true },
    kind: {
      type: String,
      enum: ["personal_photo", "group_photo", "session_video"],
      required: true,
      index: true,
    },
    title: { type: String, default: "" },
    filename: { type: String, default: "" },
    contentType: { type: String, default: "" },
    size: { type: Number, default: 0 },
    // File-backed media (photos / uploaded videos)
    storageKey: { type: String, default: "" },
    storageProvider: {
      type: String,
      enum: ["r2", "local", "youtube"],
      required: true,
    },
    // YouTube-backed session videos (unlisted recommended)
    youtubeId: { type: String, default: "" },
    // Optional access window — after this, vault hides the item
    availableUntil: { type: Date, default: null },
    guestId: { type: Schema.Types.ObjectId, ref: "Guest", default: null, index: true },
    sessionId: { type: Schema.Types.ObjectId, ref: "Session", default: null, index: true },
  },
  { timestamps: true },
);

export type EventDoc = InferSchemaType<typeof EventSchema> & { _id: mongoose.Types.ObjectId };
export type DayDoc = InferSchemaType<typeof DaySchema> & { _id: mongoose.Types.ObjectId };
export type SessionDoc = InferSchemaType<typeof SessionSchema> & { _id: mongoose.Types.ObjectId };
export type GuestDoc = InferSchemaType<typeof GuestSchema> & { _id: mongoose.Types.ObjectId };
export type MediaDoc = InferSchemaType<typeof MediaSchema> & { _id: mongoose.Types.ObjectId };

export const Event: Model<EventDoc> =
  mongoose.models.Event || mongoose.model("Event", EventSchema);
export const Day: Model<DayDoc> =
  mongoose.models.Day || mongoose.model("Day", DaySchema);
export const Session: Model<SessionDoc> =
  mongoose.models.Session || mongoose.model("Session", SessionSchema);
export const Guest: Model<GuestDoc> =
  mongoose.models.Guest || mongoose.model("Guest", GuestSchema);
export const Media: Model<MediaDoc> =
  mongoose.models.Media || mongoose.model("Media", MediaSchema);
