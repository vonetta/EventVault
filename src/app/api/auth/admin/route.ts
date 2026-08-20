import { NextResponse } from "next/server";
import { setAdminSession } from "@/lib/auth";

export async function POST(request: Request) {
  const body = await request.json();
  const password = String(body.password || "");
  const expected = process.env.ADMIN_PASSWORD;

  if (!expected) {
    return NextResponse.json(
      { error: "ADMIN_PASSWORD is not configured" },
      { status: 500 },
    );
  }

  if (password !== expected) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  await setAdminSession();
  return NextResponse.json({ ok: true });
}
