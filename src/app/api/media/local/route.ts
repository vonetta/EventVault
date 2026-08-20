import { NextResponse } from "next/server";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import path from "path";
import { Readable } from "stream";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");

  if (!key || key.includes("..")) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }

  const fullPath = path.join(process.cwd(), "uploads", key);

  try {
    const info = await stat(fullPath);
    if (!info.isFile()) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const stream = createReadStream(fullPath);
    return new NextResponse(Readable.toWeb(stream) as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(info.size),
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
