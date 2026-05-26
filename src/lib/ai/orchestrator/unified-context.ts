/**
 * Unified Session Context Builder
 * 
 * CRITICAL ARCHITECTURE DECISION:
 * Every AI request should load this ONCE and pass it through the system.
 * This prevents:
 * - Missing profile data (name disappearing)
 * - Inconsistent snapshots
 * - Multiple DB queries
 * - Context fragmentation
 * 
 * FLOW:
 * 1. Load from Redis (if exists and fresh)
 * 2. Build from DB (if cache miss or stale)
 * 3. Store in Redis for next request
 * 4. Pass to all AI systems
 */

import type { 
  UnifiedSessionContext, 
  LifeSnapshot, 
  Goal, 
  Commitment, 
  Task,
  IdentitySignal,
  ExecutionPattern,
  BehavioralPrediction,
  InferenceConfidence,
  ContextRichness,
  MemoryContext,
  UserProfile,
  LifeContext
} from "./types";
import { getLifeSnapshot, computeInferenceConfidence } from "./snapshot-engine";
import { SupabaseClient } from "@supabase/supabase-js";
import { 
  getFromCache, 
  setInCache, 
  REDIS_KEYS, 
  CACHE_TTL,
  invalidateUserCache 
} from "@/lib/redis/client";

/**
 * Get UnifiedSessionContext (with Redis caching)
 * This is the NEW way to load all user context
 * 
 * FLOW:
 * 1. Check Redis cache
 * 2. If hit and fresh, return immediately
 * 3. If miss or stale, rebuild from DB
 * 4. Store in Redis for next request
 */
export async function getUnifiedContext(
  userId: string,
  supabase: SupabaseClient
): Promise<UnifiedSessionContext> {
  // Try cache first
  const cacheKey = REDIS_KEYS.SESSION_CONTEXT(userId);
  const cached = await getFromCache<UnifiedSessionContext>(cacheKey);
  
  if (cached && cached.cacheAge < CACHE_TTL.SESSION_CONTEXT) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[UnifiedContext] CACHE HIT for ${userId} (age: ${cached.cacheAge}s)`);
    }
    return {
      ...cached,
      cacheAge: Math.floor((Date.now() - new Date(cached.lastUpdated).getTime()) / 1000),
    };
  }

  // Cache miss - build from DB
  if (process.env.NODE_ENV !== "production") {
    console.log(`[UnifiedContext] CACHE MISS for ${userId} - rebuilding from DB`);
  }
  
  const context = await buildUnifiedContext(userId, supabase);
  
  // Store in cache
  await setInCache(cacheKey, context, CACHE_TTL.SESSION_CONTEXT);
  
  return context;
}

/**
 * Build UnifiedSessionContext from database (internal)
 * Called when cache misses or is stale
 */
async function buildUnifiedContext(
  userId: string,
  supabase: SupabaseClient
): Promise<UnifiedSessionContext> {
  // Load everything in parallel
  const [
    profileResult,
    goalsResult,
    commitmentsResult,
    tasksResult,
    identitySignalsResult,
    executionPatternsResult,
    predictionsResult,
    insightsResult,
  ] = await Promise.all([
    // Profile
    supabase
      .from("profiles")
      .select("full_name, vision, founder_mode, coaching_style")
      .eq("id", userId)
      .single(),
    
    // Goals
    supabase
      .from("goals")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("priority", { ascending: false })
      .limit(10),
    
    // Commitments
    supabase
      .from("commitments")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(10),
    
    // Tasks
    supabase
      .from("tasks")
      .select("*")
      .eq("user_id", userId)
      .in("status", ["pending", "in_progress"])
      .order("due_date", { ascending: true })
      .limit(20),
    
    // Identity Signals
    supabase
      .from("identity_signals")
      .select("*")
      .eq("user_id", userId)
      .order("confidence", { ascending: false })
      .limit(5),
    
    // Execution Patterns
    supabase
      .from("execution_patterns")
      .select("*")
      .eq("user_id", userId)
      .order("confidence", { ascending: false })
      .limit(5),
    
    // Active Predictions
    supabase
      .from("behavioral_predictions")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("confidence", { ascending: false })
      .limit(5),
    
    // Recent Insights
    supabase
      .from("memories")
      .select("content")
      .eq("user_id", userId)
      .eq("memory_type", "insight")
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  // Extract data
  const profile = profileResult.data || {};
  const goals = (goalsResult.data || []) as Goal[];
  const commitments = (commitmentsResult.data || []) as Commitment[];
  const tasks = (tasksResult.data || []) as Task[];
  const identitySignals = (identitySignalsResult.data || []) as IdentitySignal[];
  const executionPatterns = (executionPatternsResult.data || []) as ExecutionPattern[];
  const predictions = (predictionsResult.data || []) as BehavioralPrediction[];
  const recentInsights = (insightsResult.data || []).map((m: { content: string }) => m.content);

  // Build life context for snapshot generation
  const lifeContext: LifeContext = {
    activeGoals: goals,
    pendingTasks: tasks,
    activeCommitments: commitments,
    recentRelationships: [],
    accountabilityItems: [],
    momentumScore: 50, // TODO: Calculate from real data
    identitySignals,
    executionPatterns,
    activePredictions: predictions,
  };

  // Build user profile
  const userProfile: UserProfile = {
    id: userId,
    fullName: profile.full_name,
    vision: profile.vision,
    founderMode: profile.founder_mode || false,
    coachingStyle: profile.coaching_style || "balanced",
    sessionCount: 0,
  };

  // Build empty memory context for snapshot (memory loaded separately in fast path)
  const emptyMemory = {
    shortTerm: [],
    longTerm: [],
    episodic: [],
    emotional: [],
    formatted: "",
  };

  // Generate snapshot
  const lifeSnapshot = getLifeSnapshot(userId, lifeContext, userProfile, emptyMemory);

  // Compute context richness
  const contextRichness: ContextRichness = {
    score: 0,
    level: "LOW",
    hasGoals: goals.length > 0,
    hasCommitments: commitments.length > 0,
    hasTasks: tasks.length > 0,
    hasRelationships: false,
  };

  if (contextRichness.hasGoals) contextRichness.score += 0.35;
  if (contextRichness.hasCommitments) contextRichness.score += 0.25;
  if (contextRichness.hasTasks) contextRichness.score += 0.25;
  if (contextRichness.hasRelationships) contextRichness.score += 0.15;

  contextRichness.level = contextRichness.score >= 0.7 ? "HIGH" : contextRichness.score >= 0.3 ? "MODERATE" : "LOW";

  // Compute inference confidence
  const inferenceConfidence = computeInferenceConfidence(contextRichness, lifeContext, emptyMemory, userProfile);

  // Build recent memory summary (compact)
  const recentMemorySummary = recentInsights.length > 0
    ? `Recent observations: ${recentInsights.slice(0, 2).join(" | ")}`
    : "No insights recorded yet.";

  // Construct unified context
  const unifiedContext: UnifiedSessionContext = {
    userId,
    profile: {
      fullName: userProfile.fullName,
      vision: userProfile.vision,
      founderMode: userProfile.founderMode || false,
      coachingStyle: userProfile.coachingStyle || "balanced",
    },
    lifeSnapshot,
    activeGoals: goals,
    activeCommitments: commitments,
    pendingTasks: tasks,
    identitySignals,
    executionPatterns,
    activePredictions: predictions,
    recentInsights: recentInsights.slice(0, 3),
    recentMemorySummary,
    inferenceConfidence,
    contextRichness,
    lastUpdated: new Date().toISOString(),
    cacheAge: 0,
  };

  return unifiedContext;
}

/**
 * Format UnifiedSessionContext for prompt injection
 * This replaces the scattered context-building in prompt-builder.ts
 */
export function formatUnifiedContextForPrompt(ctx: UnifiedSessionContext): string {
  const parts: string[] = [];

  // User Identity
  if (ctx.profile.fullName) {
    parts.push(`**User:** ${ctx.profile.fullName}`);
  }

  if (ctx.profile.vision) {
    parts.push(`**Their Vision:** "${ctx.profile.vision}"`);
  }

  if (ctx.profile.founderMode) {
    parts.push(`**Founder Mode:** ACTIVE - Think like a co-founder. Push execution. Challenge feature creep.`);
  }

  // Life Snapshot
  if (ctx.lifeSnapshot.identity !== "unknown") {
    parts.push(`**Identity:** ${ctx.lifeSnapshot.identity}`);
  }

  if (ctx.lifeSnapshot.currentFocus) {
    parts.push(`**Current Focus:** ${ctx.lifeSnapshot.currentFocus}`);
  }

  // Active Goals
  if (ctx.activeGoals.length > 0) {
    const goalTitles = ctx.activeGoals.slice(0, 5).map(g => `• ${g.title} (${g.priority})`).join("\n");
    parts.push(`**Active Goals:**\n${goalTitles}`);
  }

  // Active Commitments
  if (ctx.activeCommitments.length > 0) {
    const commitmentList = ctx.activeCommitments.slice(0, 3).map(c => `• ${c.description} (consistency: ${c.consistencyScore}%)`).join("\n");
    parts.push(`**Active Commitments:**\n${commitmentList}`);
  }

  // Identity Signals
  if (ctx.identitySignals.length > 0) {
    const signals = ctx.identitySignals
      .slice(0, 3)
      .map(s => `• ${s.description} (${s.longTermDirection})`)
      .join("\n");
    parts.push(`**Identity Signals:**\n${signals}`);
  }

  // Execution Patterns
  if (ctx.executionPatterns.length > 0) {
    const patterns = ctx.executionPatterns
      .filter(p => p.severity === "high" || p.severity === "medium")
      .slice(0, 2)
      .map(p => `• ${p.pattern}: ${p.behavioralImpact}`)
      .join("\n");
    if (patterns) {
      parts.push(`**Established Patterns:**\n${patterns}`);
    }
  }

  // Active Predictions
  if (ctx.activePredictions.length > 0) {
    const predictions = ctx.activePredictions
      .slice(0, 2)
      .map(p => `• If [${p.trigger_condition}], expect [${p.predicted_behavior}]`)
      .join("\n");
    parts.push(`**Predictive Intelligence (Watch for this):**\n${predictions}`);
  }

  // Recent Insights
  if (ctx.recentInsights.length > 0) {
    parts.push(`**Recent AI Observations:**\n${ctx.recentInsights[0]}`);
  }

  // Context Confidence
  parts.push(`\n**Context Confidence:** ${ctx.contextRichness.level} (${ctx.activeGoals.length} goals, ${ctx.pendingTasks.length} tasks, ${ctx.activeCommitments.length} commitments)`);

  return parts.join("\n\n");
}

/**
 * Invalidate UnifiedSessionContext cache
 * Call this whenever user data changes:
 * - New goal created
 * - Task completed
 * - Commitment updated
 * - Pattern detected
 * - Insight generated
 */
export async function invalidateUnifiedContext(userId: string): Promise<void> {
  await invalidateUserCache(userId);
  
  if (process.env.NODE_ENV !== "production") {
    console.log(`[UnifiedContext] Cache invalidated for user ${userId}`);
  }
}

// Re-export for convenience
export { invalidateUserCache };
