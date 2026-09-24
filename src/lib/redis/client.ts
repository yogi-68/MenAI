/**
 * Redis Client - Upstash Redis for Vercel Serverless
 * 
 * CRITICAL ARCHITECTURE:
 * Redis is now the PRIMARY cache for:
 * - UnifiedSessionContext (complete user state)
 * - LifeSnapshot (compact operating state)
 * - Recent insights and memory summaries
 * 
 * This replaces the in-memory Map() cache which resets on every deploy.
 * 
 * FLOW:
 * 1. Check Redis first
 * 2. If miss or stale, rebuild from DB
 * 3. Store in Redis with TTL
 * 4. Invalidate on data changes
 */

import { Redis } from "@upstash/redis";

// Initialize Redis client
// These env vars need to be set in Vercel:
// UPSTASH_REDIS_REST_URL
// UPSTASH_REDIS_REST_TOKEN
let redis: Redis | null = null;

export function getRedisClient(): Redis | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    console.warn("[Redis] No Upstash credentials found. Caching disabled.");
    return null;
  }

  if (!redis) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }

  return redis;
}

/**
 * Redis Key Prefixes
 * Organized by data type for easy invalidation
 */
export const REDIS_KEYS = {
  // UnifiedSessionContext - complete user state
  SESSION_CONTEXT: (userId: string) => `menai:session:${userId}`,
  
  // CognitionState - the brain of Mettle
  COGNITION_STATE: (userId: string) => `menai:cognition:${userId}`,
  
  // LifeSnapshot - compact operating state
  LIFE_SNAPSHOT: (userId: string) => `menai:snapshot:${userId}`,
  
  // Recent insights - last 3 AI observations
  RECENT_INSIGHTS: (userId: string) => `menai:insights:${userId}`,
  
  // Memory summary - compact memory for fast retrieval
  MEMORY_SUMMARY: (userId: string) => `menai:memory:${userId}`,

  // Unified user context — planner, coach rail, snapshot
  USER_CONTEXT: (userId: string) => `menai:user-context:${userId}`,

  // Conversation cache - last 30 messages
  CONVERSATION: (conversationId: string) => `menai:conv:${conversationId}`,
};

/**
 * Cache TTLs (in seconds)
 */
export const CACHE_TTL = {
  SESSION_CONTEXT: 5 * 60,      // 5 minutes
  COGNITION_STATE: 5 * 60,      // 5 minutes (same as session for fast path)
  LIFE_SNAPSHOT: 10 * 60,       // 10 minutes
  RECENT_INSIGHTS: 30 * 60,     // 30 minutes
  MEMORY_SUMMARY: 15 * 60,      // 15 minutes
  USER_CONTEXT: 15 * 60,        // 15 minutes
  CONVERSATION: 60 * 60,        // 1 hour
};

/**
 * Get from cache
 */
export async function getFromCache<T>(key: string): Promise<T | null> {
  const client = getRedisClient();
  if (!client) return null;

  try {
    const data = await client.get<T>(key);
    return data;
  } catch (error) {
    console.error(`[Redis] Get failed for ${key}:`, error);
    return null;
  }
}

/**
 * Set in cache with TTL
 */
export async function setInCache<T>(
  key: string,
  value: T,
  ttlSeconds: number
): Promise<boolean> {
  const client = getRedisClient();
  if (!client) return false;

  try {
    // No JSON.stringify: @upstash/redis serializes on write and parses on
    // read. Stringifying here double-encoded every cached value.
    await client.setex(key, ttlSeconds, value);
    return true;
  } catch (error) {
    console.error(`[Redis] Set failed for ${key}:`, error);
    return false;
  }
}

/**
 * Invalidate cache key(s)
 */
export async function invalidateCache(keys: string | string[]): Promise<void> {
  const client = getRedisClient();
  if (!client) return;

  try {
    const keyArray = Array.isArray(keys) ? keys : [keys];
    if (keyArray.length > 0) {
      await client.del(...keyArray);
      console.log(`[Redis] Invalidated cache keys:`, keyArray);
    }
  } catch (error) {
    console.error(`[Redis] Invalidation failed:`, error);
  }
}

/**
 * Invalidate all user-related caches
 * Call this when user data changes (new goal, completed task, etc.)
 */
export async function invalidateUserCache(userId: string): Promise<void> {
  await invalidateCache([
    REDIS_KEYS.SESSION_CONTEXT(userId),
    REDIS_KEYS.COGNITION_STATE(userId),
    REDIS_KEYS.SESSION_CONTEXT(userId) + ":cognition",
    REDIS_KEYS.LIFE_SNAPSHOT(userId),
    REDIS_KEYS.RECENT_INSIGHTS(userId),
    REDIS_KEYS.MEMORY_SUMMARY(userId),
    REDIS_KEYS.USER_CONTEXT(userId),
  ]);
}
