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

import { invalidateUserCache as redisInvalidateUserCache } from "@/lib/redis/client";

export function invalidateUserCache(userId: string, reason?: string): void {
  if (process.env.NODE_ENV !== "production") {
    console.log(`[Cache Invalidation] User ${userId}${reason ? ` - ${reason}` : ""}`);
  }
  
  // Fire and forget Redis invalidation
  redisInvalidateUserCache(userId).catch(err => {
    console.error("[Cache Invalidation] Failed to invalidate Redis cache:", err);
  });
}
