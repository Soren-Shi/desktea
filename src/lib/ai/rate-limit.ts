const WINDOW_MS = 60 * 60 * 1000; // 60 minutes
const MAX_BUCKETS = 5000;

export type RateLimitBucket = "vision" | "chat";

const buckets = new Map<string, number[]>();

function getLimitForBucket(bucket: RateLimitBucket): number {
  const envVal =
    bucket === "vision"
      ? process.env.DESKTEA_VISION_LIMIT_PER_HOUR
      : process.env.DESKTEA_CHAT_LIMIT_PER_HOUR;
  const parsed = Number(envVal);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return bucket === "vision" ? 12 : 40;
}

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "local";
}

function pruneMapIfNeeded() {
  if (buckets.size <= MAX_BUCKETS) return;
  const toDelete = buckets.size - MAX_BUCKETS + 250;
  let removed = 0;
  for (const key of buckets.keys()) {
    buckets.delete(key);
    removed++;
    if (removed >= toDelete) break;
  }
}

export function checkRateLimit(
  req: Request,
  bucket: RateLimitBucket
): { allowed: boolean; remaining: number; retryAfterSec: number; limit: number } {
  const now = Date.now();
  const limit = getLimitForBucket(bucket);
  const ip = getClientIp(req);
  const key = `${bucket}:${ip}`;

  pruneMapIfNeeded();

  const existing = buckets.get(key) || [];
  const valid = existing.filter((ts) => now - ts < WINDOW_MS);

  if (valid.length >= limit) {
    buckets.set(key, valid);
    const oldest = valid[0];
    const retryAfterSec = Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000));
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec,
      limit,
    };
  }

  valid.push(now);
  buckets.set(key, valid);

  return {
    allowed: true,
    remaining: Math.max(0, limit - valid.length),
    retryAfterSec: 0,
    limit,
  };
}
