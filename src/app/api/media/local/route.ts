import { NextResponse } from "next/server";

/** Legacy key-based media URLs are disabled — use /api/media/:id (authz gated). */
export async function GET() {
  return NextResponse.json(
    { error: "This media URL is no longer supported. Use /api/media/:id" },
    { status: 410 },
  );
}
