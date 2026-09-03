import { connectDB } from "@/lib/db";
import { RateLimitBucket } from "@/lib/models";

type Bucket = { count: number; resetAt: number };

const memoryBuckets = new Map<string, Bucket>();

function rateLimitMemory(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const existing = memoryBuckets.get(key);

  if (!existing || existing.resetAt <= now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true as const, remaining: limit - 1 };
  }

  if (existing.count >= limit) {
    return {
      ok: false as const,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return { ok: true as const, remaining: limit - existing.count };
}

async function rateLimitMongo(key: string, limit: number, windowMs: number) {
  await connectDB();
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowMs);

  try {
    await RateLimitBucket.updateOne(
      { key },
      { $setOnInsert: { key, count: 0, resetAt } },
      { upsert: true },
    );
  } catch {
    // Unique-key race: the bucket already exists.
  }

  await RateLimitBucket.updateOne(
    { key, resetAt: { $lte: now } },
    { $set: { count: 0, resetAt } },
  );

  const result = await RateLimitBucket.findOneAndUpdate(
    { key, count: { $lt: limit } },
    { $inc: { count: 1 } },
    { new: true },
  );

  if (!result) {
    const bucket = await RateLimitBucket.findOne({ key });
    const retryMs = bucket ? bucket.resetAt.getTime() - now.getTime() : windowMs;
    return {
      ok: false as const,
      retryAfterSec: Math.max(1, Math.ceil(retryMs / 1000)),
    };
  }

  return { ok: true as const, remaining: Math.max(0, limit - result.count) };
}

/**
 * Rate limiter — uses MongoDB when available (shared across Vercel instances).
 * In production, Mongo errors fail closed (429) instead of falling back to
 * a per-lambda memory map that attackers can bypass.
 */
export async function rateLimit(key: string, limit: number, windowMs: number) {
  if (process.env.MONGODB_URI) {
    try {
      return await rateLimitMongo(key, limit, windowMs);
    } catch {
      if (process.env.NODE_ENV === "production") {
        return { ok: false as const, retryAfterSec: 30 };
      }
    }
  }
  return rateLimitMemory(key, limit, windowMs);
}

export function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") || "unknown";
}
