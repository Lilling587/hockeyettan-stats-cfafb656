// Simple in-memory rate limiter for the public vMix endpoints.
// Note: each Cloudflare Worker instance has its own memory, so this limits
// per-IP within a single warm instance. Combined with Cache-Control caching
// (max-age=30), this provides basic flood protection without a database.

const WINDOW_MS = 60_000; // 1 minute window
const MAX_REQUESTS = 120; // ~2 requests/second average per IP

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function checkRateLimit(ip: string): { allowed: boolean } {
  const now = Date.now();
  let bucket = buckets.get(ip);

  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(ip, bucket);
  }

  bucket.count++;

  // Prune stale entries to prevent unbounded memory growth.
  if (buckets.size > 5_000) {
    for (const [key, b] of buckets.entries()) {
      if (now > b.resetAt) buckets.delete(key);
    }
  }

  return { allowed: bucket.count <= MAX_REQUESTS };
}

export function getClientIp(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Forwarded-For")?.split(",")[0].trim() ??
    "unknown"
  );
}
