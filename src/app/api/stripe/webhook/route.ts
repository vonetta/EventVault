import { NextResponse } from "next/server";

/** Stripe webhooks are unused — photo unlock is Zelle + admin confirmation. */
export async function POST() {
  return NextResponse.json(
    { error: "Stripe unlocks are disabled. Use Zelle + admin Mark paid." },
    { status: 410 },
  );
}
