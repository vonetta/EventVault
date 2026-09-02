import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";

export async function GET() {
  const checks: Record<string, string> = {
    app: "ok",
    mongo: "unknown",
    r2: process.env.R2_BUCKET_NAME ? "configured" : "missing",
    email: process.env.GMAIL_USER ? "configured" : "missing",
    appUrl: process.env.APP_URL || "missing",
  };

  try {
    await connectDB();
    checks.mongo = "ok";
  } catch {
    checks.mongo = "error";
  }

  const healthy = checks.mongo === "ok";
  return NextResponse.json(
    { status: healthy ? "ok" : "degraded", checks },
    { status: healthy ? 200 : 503 },
  );
}
