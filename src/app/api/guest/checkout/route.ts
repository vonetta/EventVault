import { NextResponse } from "next/server";

/**
 * Stripe Checkout is no longer used for photo unlocks (Zelle instead, to avoid
 * card fees). Keep this stub so old webhook endpoints return a clear message
 * if Stripe is still pointed here.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Card checkout is disabled. Guests unlock photos by sending Zelle; an admin marks them paid.",
    },
    { status: 410 },
  );
}
