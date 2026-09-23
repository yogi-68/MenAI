/**
 * Fixed-window rate limiting on Upstash Redis.
 *
 * Deliberately not @upstash/ratelimit: we already hold a Redis client, the
 * window semantics we need are trivial, and a dependency-free implementation
 * keeps the failure mode explicit (see below).
 *
 * Failure mode: when Redis is unavailable this FAILS OPEN. Rate limiting is a
 * cost and abuse control, not an authorization control — every caller is
 * already authenticated by the time we get here, so degrading to "allow" is
 * preferable to taking the product down when the cache blinks. Authorization
 * checks elsewhere in this codebase fail CLOSED, and that distinction is
 * intentional.
 */

import { getRedisClient } from "@/lib/redis/client";
import { logger } from "@/lib/observability/logger";

export interface RateLimitRule {
  /** Maximum requests permitted inside the window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

/** Named rules, so limits are visible in one place rather than at call sites. */
export const RATE_LIMITS = {
  /** Chat is the expensive path — every turn costs model spend. */
  chat: { limit: 20, windowSeconds: 60 },
  /** Plan generation runs a large prompt. */
  planGenerate: { limit: 10, windowSeconds: 60 },
  /** Unauthenticated or near-unauthenticated surfaces get the tightest rule. */
  auth: { limit: 5, windowSeconds: 300 },
  /** General authenticated write traffic. */
  write: { limit: 60, windowSeconds: 60 },
  /** Read traffic — generous, still bounded. */
  read: { limit: 200, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitRule>;

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Unix ms at which the current window expires. */
  resetAt: number;
}

/**
 * Consume one unit against `identifier` under `rule`.
 *
 * The window is derived from the clock rather than stored, so the first write
 * in a window sets the TTL and every subsequent one is a bare INCR.
 */
export async function rateLimit(
  identifier: string,
  rule: RateLimitRule
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowMs = rule.windowSeconds * 1000;
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const resetAt = windowStart + windowMs;

  const client = getRedisClient();
  if (!client) {
    return { allowed: true, limit: rule.limit, remaining: rule.limit, resetAt };
  }

  const key = `mettle:rl:${identifier}:${windowStart}`;

  try {
    const count = await client.incr(key);
    // Only the request that created the key needs to set expiry.
    if (count === 1) {
      await client.expire(key, rule.windowSeconds);
    }
    return {
      allowed: count <= rule.limit,
      limit: rule.limit,
      remaining: Math.max(0, rule.limit - count),
      resetAt,
    };
  } catch (error) {
    logger.error("[rate-limit] Redis failure — failing open", error, { identifier });
    return { allowed: true, limit: rule.limit, remaining: rule.limit, resetAt };
  }
}

/** Standard headers so clients can back off without guessing. */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "RateLimit-Limit": String(result.limit),
    "RateLimit-Remaining": String(result.remaining),
    "RateLimit-Reset": String(Math.ceil((result.resetAt - Date.now()) / 1000)),
  };
}

/**
 * Best-effort client identifier for surfaces with no session.
 * Falls back to a constant, which makes the limit global for those callers —
 * acceptable for the auth surfaces this is used on.
 */
export function clientIdentifier(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || headers.get("x-real-ip");
  return ip ? `ip:${ip}` : "ip:unknown";
}
