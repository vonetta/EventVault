import { readFileSync, existsSync } from "node:fs";
import mongoose from "mongoose";

function loadEnv() {
  const path = new URL("../.env.local", import.meta.url);
  if (!existsSync(path)) return {};
  const env = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

const env = loadEnv();
const uri = env.MONGODB_URI || "mongodb://127.0.0.1:27017/eventvault";

const EventSchema = new mongoose.Schema({
  name: String,
  slug: { type: String, unique: true },
  description: String,
  startsOn: String,
  endsOn: String,
}, { timestamps: true });

const DaySchema = new mongoose.Schema({
  eventId: { type: mongoose.Schema.Types.ObjectId, index: true },
  label: String,
  date: String,
  sortOrder: Number,
}, { timestamps: true });

const GuestSchema = new mongoose.Schema({
  eventId: { type: mongoose.Schema.Types.ObjectId, index: true },
  name: String,
  email: String,
  tier: String,
  ticketCode: { type: String, unique: true, index: true },
}, { timestamps: true });

const Event = mongoose.models.Event || mongoose.model("Event", EventSchema);
const Day = mongoose.models.Day || mongoose.model("Day", DaySchema);
const Guest = mongoose.models.Guest || mongoose.model("Guest", GuestSchema);

await mongoose.connect(uri);

const existing = await Event.findOne({ slug: "demo-weekend" });
if (existing) {
  const guests = await Guest.find({ eventId: existing._id }).lean();
  console.log("Demo already seeded.");
  for (const g of guests) {
    console.log(`  ${g.tier.toUpperCase().padEnd(8)} ${g.ticketCode}  (${g.name})`);
  }
  await mongoose.disconnect();
  process.exit(0);
}

const event = await Event.create({
  name: "Weekend Gathering",
  slug: "demo-weekend",
  description: "Demo event for local presentation",
  startsOn: "2026-08-22",
  endsOn: "2026-08-24",
});

await Day.insertMany([
  { eventId: event._id, label: "Day 1", date: "2026-08-22", sortOrder: 0 },
  { eventId: event._id, label: "Day 2", date: "2026-08-23", sortOrder: 1 },
  { eventId: event._id, label: "Day 3", date: "2026-08-24", sortOrder: 2 },
]);

const guests = await Guest.insertMany([
  {
    eventId: event._id,
    name: "Jane Doe",
    email: "jane@email.com",
    tier: "vip",
    ticketCode: "EV-DEMO-VIP",
  },
  {
    eventId: event._id,
    name: "John Smith",
    email: "john@email.com",
    tier: "standard",
    ticketCode: "EV-DEMO-STD",
  },
]);

console.log("Demo seeded.");
console.log(`  Admin password: ${env.ADMIN_PASSWORD || "(set ADMIN_PASSWORD in .env.local)"}`);
for (const g of guests) {
  console.log(`  ${g.tier.toUpperCase().padEnd(8)} ${g.ticketCode}  (${g.name})`);
}

await mongoose.disconnect();
