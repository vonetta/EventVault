import { NextResponse } from "next/server";
import { setAdminSession, secureEqual, assertSameOrigin } from "@/lib/auth";
import { assertProductionSecrets } from "@/lib/env";
import { adminLoginSchema } from "@/lib/validate";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip = clientIp(request);
  const limited = await rateLimit(`admin:${ip}`, 10, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } },
    );
  }

  try {
    const body = adminLoginSchema.parse(await request.json());
    const expected = process.env.ADMIN_PASSWORD;

    if (!expected) {
      return NextResponse.json(
        { error: "ADMIN_PASSWORD is not configured" },
        { status: 500 },
      );
    }

    if (!secureEqual(body.password, expected)) {
      return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
    }

    try {
      assertProductionSecrets();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Server misconfigured";
      return NextResponse.json({ error: message }, { status: 500 });
    }

    await setAdminSession();
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error && typeof error === "object" && "issues" in error) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
