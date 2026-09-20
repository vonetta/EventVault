import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import {
  assertSameOrigin,
  isAdminAuthenticated,
  isUploaderAuthenticated,
  unauthorized,
} from "@/lib/auth";
import { Event, FaceProfile, Guest } from "@/lib/models";
import { isValidDescriptor } from "@/lib/face-match";
import { logAdminAction } from "@/lib/audit";
import { objectIdSchema } from "@/lib/validate";
import { z } from "zod";

const saveFacesSchema = z.object({
  eventId: objectIdSchema,
  samples: z
    .array(
      z.object({
        guestId: objectIdSchema,
        descriptor: z.array(z.number()).length(128),
      }),
    )
    .min(1)
    .max(40),
});

async function assertUploaderOrAdmin() {
  if (await isUploaderAuthenticated()) return "uploader";
  if (await isAdminAuthenticated()) return "admin";
  return null;
}

/** Known face samples for an event (used to auto-tag the rest of the gallery). */
export async function GET(request: Request) {
  if (!(await assertUploaderOrAdmin())) return unauthorized();

  const eventId = new URL(request.url).searchParams.get("eventId") || "";
  if (!objectIdSchema.safeParse(eventId).success) {
    return NextResponse.json({ error: "Invalid eventId" }, { status: 400 });
  }

  await connectDB();
  const [profiles, guests] = await Promise.all([
    FaceProfile.find({ eventId }).lean(),
    Guest.find({ eventId }).select("_id name").lean(),
  ]);
  const nameById = new Map(guests.map((guest) => [String(guest._id), guest.name]));

  return NextResponse.json(
    {
      profiles: profiles.map((profile) => ({
        guestId: String(profile.guestId),
        name: nameById.get(String(profile.guestId)) || "Unknown",
        descriptors: (profile.descriptors || []).filter(isValidDescriptor),
        sampleCount: (profile.descriptors || []).length,
      })),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

/** Save face samples from a seed photo (name faces once, then scan the gallery). */
export async function POST(request: Request) {
  const actor = await assertUploaderOrAdmin();
  if (!actor) return unauthorized();

  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: z.infer<typeof saveFacesSchema>;
  try {
    body = saveFacesSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  await connectDB();
  const event = await Event.findById(body.eventId);
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const guestIds = [...new Set(body.samples.map((sample) => sample.guestId))];
  const guests = await Guest.find({ _id: { $in: guestIds }, eventId: body.eventId }).select("_id");
  if (guests.length !== guestIds.length) {
    return NextResponse.json({ error: "One or more guests were not found" }, { status: 400 });
  }

  const MAX_SAMPLES = 12;
  let saved = 0;
  for (const guestId of guestIds) {
    const descriptors = body.samples
      .filter((sample) => sample.guestId === guestId)
      .map((sample) => sample.descriptor)
      .filter(isValidDescriptor);
    if (!descriptors.length) continue;

    const existing = await FaceProfile.findOne({ eventId: body.eventId, guestId }).lean();
    const previous = ((existing?.descriptors || []) as unknown as number[][])
      .map((row) => (Array.isArray(row) ? row.map(Number) : []))
      .filter((row) => row.length === 128);
    const merged = [...previous, ...descriptors].slice(-MAX_SAMPLES);

    await FaceProfile.findOneAndUpdate(
      { eventId: body.eventId, guestId },
      { $set: { descriptors: merged } },
      { upsert: true, new: true },
    );
    saved += 1;
  }

  await logAdminAction(request, "save_face_profiles", {
    eventId: body.eventId,
    guests: saved,
    samples: body.samples.length,
    actor,
  });

  return NextResponse.json({ ok: true, guests: saved, samples: body.samples.length });
}
