/**
 * Life Snapshot Engine — Compact User Operating State Cache
 * 
 * Instead of rebuilding full context every request, this generates
 * a compact "snapshot" of the user's operating state that can be:
 * 1. Cached in-memory between requests
 * 2. Injected directly into prompts for fast personalization
 * 3. Updated incrementally as new data arrives
 * 
 * This dramatically improves:
 * - Response speed (no full context rebuild)
 * - Prompt quality (compact, relevant context)
 * - Orchestration simplicity (single object to check)
 */

import type { LifeContext, LifeSnapshot, InferenceConfidence, InferenceType, ContextRichness, MemoryContext, UserProfile } from "./types";

// In-memory cache (per-process, resets on deploy)
const snapshotCache = new Map<string, { snapshot: LifeSnapshot; cachedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get or generate a life snapshot for a user.
 * Uses cache if available and fresh, otherwise generates from life context.
 */
export function getLifeSnapshot(
  userId: string,
  lifeContext: LifeContext | null | undefined,
  user: UserProfile,
  memory: MemoryContext
): LifeSnapshot {
  // Check cache
  const cached = snapshotCache.get(userId);
  const now = Date.now();
  
  if (cached && (now - cached.cachedAt) < CACHE_TTL_MS) {
    return {
      ...cached.snapshot,
      snapshotAge: Math.round((now - cached.cachedAt) / 60000),
    };
  }

  // Generate fresh snapshot
  const snapshot = generateSnapshot(lifeContext, user, memory);
  
  // Cache it
  snapshotCache.set(userId, { snapshot, cachedAt: now });
  
  return snapshot;
}

/**
 * Generate a compact snapshot from full life context
 */
function generateSnapshot(
  lifeContext: LifeContext | null | undefined,
  user: UserProfile,
  memory: MemoryContext
): LifeSnapshot {
  // Identity detection
  let identity = "unknown";
  if (user.founderMode) {
    identity = "founder";
  } else if (memory.formatted.toLowerCase().includes("startup") || memory.formatted.toLowerCase().includes("my product")) {
    identity = "founder";
  } else if (memory.formatted.toLowerCase().includes("student") || memory.formatted.toLowerCase().includes("studying")) {
    identity = "student";
  } else if (memory.formatted.toLowerCase().includes("team") || memory.formatted.toLowerCase().includes("manage")) {
    identity = "executive";
  }

  // Current focus (from highest-priority goal or recent memory)
  let currentFocus = "";
  if (lifeContext?.activeGoals?.length) {
    const criticalGoal = lifeContext.activeGoals.find(g => g.priority === "critical");
    const highGoal = lifeContext.activeGoals.find(g => g.priority === "high");
    currentFocus = (criticalGoal || highGoal || lifeContext.activeGoals[0]).title;
  } else if (memory.longTerm.length > 0) {
    // Infer from memory
    currentFocus = "inferred from conversations";
  }

  // Active goal titles (compact)
  const activeGoalTitles = (lifeContext?.activeGoals || []).slice(0, 5).map(g => g.title);

  // Top priority
  const topPriority = activeGoalTitles.length > 0 ? activeGoalTitles[0] : null;

  // Momentum trend
  const momentumScore = lifeContext?.momentumScore ?? 50;
  let momentum: LifeSnapshot["momentum"] = "unknown";
  if (momentumScore >= 70) momentum = "rising";
  else if (momentumScore >= 40) momentum = "stable";
  else if (momentumScore > 0) momentum = "declining";

  // Dominant execution pattern (from accountability items)
  let dominantPattern: string | null = null;
  const overdue = lifeContext?.accountabilityItems?.filter(a => a.status === "overdue") || [];
  const missed = lifeContext?.accountabilityItems?.filter(a => a.status === "missed") || [];
  if (overdue.length >= 3) dominantPattern = "procrastination";
  else if (missed.length >= 2) dominantPattern = "avoidance";

  return {
    identity,
    currentFocus,
    activeGoalTitles,
    topPriority,
    momentum,
    dominantPattern,
    energyTrend: "unknown", // Will be enriched by future energy tracking
    lastActiveAt: new Date().toISOString(),
    snapshotAge: 0,
  };
}

/**
 * Compute inference confidence based on what data sources we have
 */
export function computeInferenceConfidence(
  contextRichness: ContextRichness,
  lifeContext: LifeContext | null | undefined,
  memory: MemoryContext,
  user: UserProfile
): InferenceConfidence {
  // Goals: explicit if we have structured goals, inferred if only from memory
  let goals: InferenceType = "weakly_inferred";
  if (contextRichness.hasGoals) {
    goals = "explicit";
  } else if (memory.longTerm.length > 0 || memory.episodic.length > 0) {
    goals = "inferred";
  }

  // Identity: explicit if founder_mode set, inferred from signals
  let identity: InferenceType = "weakly_inferred";
  if (user.founderMode) {
    identity = "explicit";
  } else if (memory.formatted.toLowerCase().includes("startup") || memory.formatted.toLowerCase().includes("founder")) {
    identity = "inferred";
  }

  // Priorities: explicit if tasks exist with priority, inferred from goals
  let priorities: InferenceType = "weakly_inferred";
  if (contextRichness.hasTasks) {
    priorities = "explicit";
  } else if (contextRichness.hasGoals) {
    priorities = "inferred";
  }

  // Patterns: inferred if we have enough history
  let patterns: InferenceType = "weakly_inferred";
  const accountabilityCount = lifeContext?.accountabilityItems?.length || 0;
  if (accountabilityCount >= 5) {
    patterns = "explicit"; // Enough data for confident patterns
  } else if (accountabilityCount >= 2 || memory.episodic.length >= 3) {
    patterns = "inferred";
  }

  // Overall: the lowest confidence across all dimensions
  const all = [goals, identity, priorities, patterns];
  let overall: InferenceType = "explicit";
  if (all.includes("weakly_inferred")) overall = "weakly_inferred";
  else if (all.includes("inferred")) overall = "inferred";

  return { goals, identity, priorities, patterns, overall };
}

/**
 * Format snapshot for prompt injection (compact, efficient)
 */
export function formatSnapshotForPrompt(snapshot: LifeSnapshot): string {
  const parts: string[] = [];

  if (snapshot.identity !== "unknown") {
    parts.push(`Identity: ${snapshot.identity}`);
  }
  if (snapshot.currentFocus) {
    parts.push(`Current focus: ${snapshot.currentFocus}`);
  }
  if (snapshot.activeGoalTitles.length > 0) {
    parts.push(`Active goals: ${snapshot.activeGoalTitles.join(", ")}`);
  }
  if (snapshot.topPriority) {
    parts.push(`Top priority: ${snapshot.topPriority}`);
  }
  if (snapshot.momentum !== "unknown") {
    parts.push(`Momentum: ${snapshot.momentum}`);
  }
  if (snapshot.dominantPattern) {
    parts.push(`Watch for: ${snapshot.dominantPattern}`);
  }

  if (parts.length === 0) return "";

  return `## User Operating Snapshot\n${parts.join("\n")}`;
}

/**
 * Format inference confidence for prompt guidance
 */
export function formatInferenceGuidance(confidence: InferenceConfidence): string {
  if (confidence.overall === "explicit") {
    return ""; // No special guidance needed — we have real data
  }

  const parts: string[] = [];

  if (confidence.goals === "inferred") {
    parts.push("- Goals are INFERRED from conversations, not explicitly confirmed. Frame suggestions as: \"Based on what you've shared...\"");
  }
  if (confidence.goals === "weakly_inferred") {
    parts.push("- Goals are WEAKLY INFERRED. Use soft language: \"It seems like you're focused on...\" and invite correction.");
  }
  if (confidence.identity === "inferred" || confidence.identity === "weakly_inferred") {
    parts.push("- Their identity/role is inferred, not confirmed. Don't assume job titles or life stages.");
  }
  if (confidence.priorities === "weakly_inferred") {
    parts.push("- Priorities are unclear. Suggest what SEEMS important, mark as suggestions, invite adjustment.");
  }
  if (confidence.patterns === "inferred") {
    parts.push("- Execution patterns are emerging but not confirmed. Name them gently: \"I'm noticing a pattern...\"");
  }

  if (parts.length === 0) return "";

  return `## Inference Confidence Guide\nSome context is inferred, not confirmed. Adjust your language accordingly:\n${parts.join("\n")}`;
}

/**
 * Invalidate a user's cached snapshot (call after data changes)
 */
export function invalidateSnapshot(userId: string): void {
  snapshotCache.delete(userId);
}
