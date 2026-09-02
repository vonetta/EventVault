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

  const existing = await RateLimitBucket.findOne({ key });
  if (!existing || existing.resetAt <= now) {
    await RateLimitBucket.findOneAndUpdate(
      { key },
      { $set: { count: 1, resetAt } },
      { upsert: true, new: true },
    );
    return { ok: true as const, remaining: limit - 1 };
  }

  if (existing.count >= limit) {
    return {
      ok: false as const,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt.getTime() - now.getTime()) / 1000)),
    };
  }

  const updated = await RateLimitBucket.findOneAndUpdate(
    { key, count: { $lt: limit } },
    { $inc: { count: 1 } },
    { new: true },
  );

  if (!updated) {
    return {
      ok: false as const,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt.getTime() - now.getTime()) / 1000)),
    };
  }

  return { ok: true as const, remaining: limit - updated.count };
}

/**
 * Rate limiter — uses MongoDB when available (shared across Vercel instances),
 * falls back to per-instance memory in local dev.
 */
export async function rateLimit(key: string, limit: number, windowMs: number) {
  if (process.env.MONGODB_URI) {
    try {
      return await rateLimitMongo(key, limit, windowMs);
    } catch {
      // Fall through to memory limiter
    }
  }
  return rateLimitMemory(key, limit, windowMs);
}

export function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") || "unknown";
}
