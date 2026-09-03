import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { isAdminAuthenticated } from "@/lib/auth";

export async function GET() {
  let mongoOk = false;
  try {
    await connectDB();
    mongoOk = true;
  } catch {
    // mongo down
  }

  const admin = await isAdminAuthenticated();

  if (!admin) {
    return NextResponse.json(
      { status: mongoOk ? "ok" : "degraded" },
      { status: mongoOk ? 200 : 503 },
    );
  }

  const checks: Record<string, string> = {
    app: "ok",
    mongo: mongoOk ? "ok" : "error",
    r2: process.env.R2_BUCKET_NAME ? "configured" : "missing",
    email: process.env.GMAIL_USER ? "configured" : "missing",
  };

  return NextResponse.json(
    { status: mongoOk ? "ok" : "degraded", checks },
    { status: mongoOk ? 200 : 503 },
  );
}
