import { NextResponse } from "next/server";
import { z } from "zod";
import {
  assertSameOrigin,
  isAdminAuthenticated,
  unauthorized,
} from "@/lib/auth";
import { sendTestEmail } from "@/lib/email";

const testEmailSchema = z.object({
  to: z.string().email().max(200),
});

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) return unauthorized();

  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let to: string;
  try {
    const body = testEmailSchema.parse(await request.json());
    to = body.to.trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }

  const result = await sendTestEmail(to);
  if (!result.sent) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }

  return NextResponse.json({ ok: true, to });
}
