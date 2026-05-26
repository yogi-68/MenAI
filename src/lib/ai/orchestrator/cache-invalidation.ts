/**
 * Cache Invalidation Utility
 * 
 * Centralized cache invalidation for user context snapshots.
 * Call this whenever user data changes (goals, tasks, commitments, memory)
 * to ensure the AI always has fresh context.
 * 
 * This implements the "invalidate on write" pattern recommended for
 * AI memory systems to prevent stale context bugs.
 */

import { invalidateSnapshot } from "./snapshot-engine";

/**
 * Invalidate all cached context for a user.
 * 
 * Call this after:
 * - Creating, updating, or deleting goals
 * - Creating, updating, or deleting tasks
 * - Creating, updating, or deleting commitments
 * - Writing new memories
 * - Any other user data mutation that affects AI context
 * 
 * @param userId - The user ID whose cache should be invalidated
 * @param reason - Optional reason for invalidation (for logging)
 */
export function invalidateUserCache(userId: string, reason?: string): void {
  if (process.env.NODE_ENV !== "production") {
    console.log(`[Cache Invalidation] User ${userId}${reason ? ` - ${reason}` : ""}`);
  }
  
  // Invalidate the LifeSnapshot cache
  invalidateSnapshot(userId);
  
  // Future: Add Redis invalidation here when distributed cache is added
  // await redis.del(`snapshot:${userId}`);
  // await redis.del(`lifeContext:${userId}`);
}

/**
 * Check if Redis is available for distributed caching.
 * This is a placeholder for future Redis integration.
 */
function isRedisEnabled(): boolean {
  return !!process.env.REDIS_URL;
}

/**
 * Future: Invalidate Redis cache
 * Uncomment when Redis is integrated
 */
/*
async function invalidateRedisCache(userId: string): Promise<void> {
  if (!isRedisEnabled()) return;
  
  const redis = await getRedisClient();
  await Promise.all([
    redis.del(`snapshot:${userId}`),
    redis.del(`lifeContext:${userId}`),
    redis.del(`memory:${userId}`),
  ]);
}
*/
