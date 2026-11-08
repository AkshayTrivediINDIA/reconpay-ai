import { RateLimitError } from "./errors";

type Bucket = { count: number; resetAt: number };

const globalForRateLimit = globalThis as unknown as {
  __reconpayRateLimits?: Map<string, Bucket>;
};

function buckets(): Map<string, Bucket> {
  if (!globalForRateLimit.__reconpayRateLimits) {
    globalForRateLimit.__reconpayRateLimits = new Map();
  }
  return globalForRateLimit.__reconpayRateLimits;
}

/**
 * Fixed-window in-memory limiter. Adequate for a single Node instance and the
 * demo. Production deployments should use a shared Redis/Upstash limiter; the
 * function signature is intentionally replaceable.
 */
export function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
  const now = Date.now();
  const store = buckets();
  const current = store.get(key);
  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }
  if (current.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }
  current.count += 1;
  return {
    allowed: true,
    remaining: limit - current.count,
    retryAfterSeconds: 0,
  };
}

export function enforceRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): void {
  const result = consumeRateLimit(key, limit, windowMs);
  if (!result.allowed) throw new RateLimitError(result.retryAfterSeconds);
}

export function resetRateLimits(): void {
  buckets().clear();
}
