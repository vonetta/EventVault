import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { isAdminAuthenticated, isUploaderAuthenticated, unauthorized } from "@/lib/auth";
import { Event } from "@/lib/models";

/** Minimal event list for the team-upload picker — names only, no guest data. */
export async function GET() {
  if (!(await isUploaderAuthenticated()) && !(await isAdminAuthenticated())) {
    return unauthorized();
  }

  await connectDB();
  const events = await Event.find().sort({ createdAt: -1 }).select("name").lean();

  return NextResponse.json(
    { events: events.map((event) => ({ _id: String(event._id), name: event.name })) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
