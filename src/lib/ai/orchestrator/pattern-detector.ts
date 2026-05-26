/**
 * Pattern Detector — Longitudinal Behavioral Intelligence
 * 
 * Foundation for the future moat: intelligence over time
 * 
 * Detects recurring patterns across conversations and stores them
 * as behavioral observations for long-term intelligence building.
 * 
 * Example outputs after 2 weeks:
 * "Over the last 10 days, you consistently return to startup thinking 
 * when uncertain about direction. But your execution energy increases 
 * when you simplify focus instead of expanding possibilities."
 */

import { createServiceRoleClient } from "@/lib/supabase/server";

export interface BehavioralObservation {
  id?: string;
  userId: string;
  observationType: 
    | "execution_pattern"
    | "direction_shift"
    | "emotional_trend"
    | "identity_evolution"
    | "momentum_pattern"
    | "commitment_pattern";
  observation: string;
  firstSeen: Date;
  lastSeen: Date;
  occurrenceCount: number;
  confidence: number;
  metadata?: Record<string, unknown>;
}

/**
 * Detect and record behavioral patterns from recent activity
 * Called after conversations and during weekly summaries
 */
export async function detectAndRecordPatterns(
  userId: string
): Promise<BehavioralObservation[]> {
  const supabase = await createServiceRoleClient();
  const patterns: BehavioralObservation[] = [];
  
  // Get recent memories to analyze patterns
  const { data: memories } = await supabase
    .from("memories")
    .select("content, memory_type, created_at")
    .eq("user_id", userId)
    .gte("created_at", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()) // Last 14 days
    .order("created_at", { ascending: false })
    .limit(100);
  
  if (!memories || memories.length === 0) return patterns;
  
  // Get existing observations to update
  const { data: existingObservations } = await supabase
    .from("behavioral_observations")
    .select("*")
    .eq("user_id", userId);
  
  // Pattern 1: Founder identity from repeated mentions
  const founderMentions = memories.filter(m => 
    /startup|founder|product|saas|mvp|launch/i.test(m.content)
  );
  
  if (founderMentions.length >= 5) {
    await upsertObservation({
      userId,
      observationType: "identity_evolution",
      observation: "Consistently returns to startup and founder thinking across multiple conversations",
      confidence: Math.min(0.95, 0.7 + (founderMentions.length * 0.05)),
      metadata: { mention_count: founderMentions.length },
    }, existingObservations);
    
    patterns.push({
      userId,
      observationType: "identity_evolution",
      observation: "Founder identity signal",
      firstSeen: new Date(founderMentions[founderMentions.length - 1].created_at),
      lastSeen: new Date(founderMentions[0].created_at),
      occurrenceCount: founderMentions.length,
      confidence: Math.min(0.95, 0.7 + (founderMentions.length * 0.05)),
    });
  }
  
  // Pattern 2: Direction uncertainty from repeated questioning
  const directionQuestions = memories.filter(m => 
    /what should i do|what direction|not sure what|don't know what i want/i.test(m.content)
  );
  
  if (directionQuestions.length >= 3) {
    await upsertObservation({
      userId,
      observationType: "direction_shift",
      observation: "Frequent questions about direction and priorities indicate ongoing clarity challenges",
      confidence: Math.min(0.9, 0.65 + (directionQuestions.length * 0.08)),
      metadata: { question_count: directionQuestions.length },
    }, existingObservations);
    
    patterns.push({
      userId,
      observationType: "direction_shift",
      observation: "Direction uncertainty pattern",
      firstSeen: new Date(directionQuestions[directionQuestions.length - 1].created_at),
      lastSeen: new Date(directionQuestions[0].created_at),
      occurrenceCount: directionQuestions.length,
      confidence: Math.min(0.9, 0.65 + (directionQuestions.length * 0.08)),
    });
  }
  
  // Pattern 3: Execution vs planning imbalance
  const planningMentions = memories.filter(m => 
    /plan|planning|should plan|need to plan/i.test(m.content)
  );
  const executionMentions = memories.filter(m => 
    /finished|completed|shipped|done|built/i.test(m.content)
  );
  
  if (planningMentions.length >= 4 && executionMentions.length <= 2) {
    await upsertObservation({
      userId,
      observationType: "execution_pattern",
      observation: "Spends significantly more time planning than executing - pattern of analysis paralysis",
      confidence: 0.85,
      metadata: { 
        planning_mentions: planningMentions.length,
        execution_mentions: executionMentions.length,
      },
    }, existingObservations);
    
    patterns.push({
      userId,
      observationType: "execution_pattern",
      observation: "Planning > Execution imbalance",
      firstSeen: new Date(planningMentions[planningMentions.length - 1].created_at),
      lastSeen: new Date(planningMentions[0].created_at),
      occurrenceCount: planningMentions.length,
      confidence: 0.85,
    });
  }
  
  // Pattern 4: Emotional trend - persistent stress/overwhelm
  const stressMentions = memories.filter(m => 
    /stressed|overwhelmed|anxious|exhausted|burned out/i.test(m.content)
  );
  
  if (stressMentions.length >= 4) {
    await upsertObservation({
      userId,
      observationType: "emotional_trend",
      observation: "Persistent pattern of stress and overwhelm mentioned across multiple sessions",
      confidence: Math.min(0.9, 0.7 + (stressMentions.length * 0.05)),
      metadata: { stress_mentions: stressMentions.length },
    }, existingObservations);
    
    patterns.push({
      userId,
      observationType: "emotional_trend",
      observation: "Chronic stress pattern",
      firstSeen: new Date(stressMentions[stressMentions.length - 1].created_at),
      lastSeen: new Date(stressMentions[0].created_at),
      occurrenceCount: stressMentions.length,
      confidence: Math.min(0.9, 0.7 + (stressMentions.length * 0.05)),
    });
  }
  
  return patterns;
}

/**
 * Upsert a behavioral observation (create or update existing)
 */
async function upsertObservation(
  observation: {
    userId: string;
    observationType: BehavioralObservation["observationType"];
    observation: string;
    confidence: number;
    metadata?: Record<string, unknown>;
  },
  existingObservations?: any[] | null
): Promise<void> {
  const supabase = await createServiceRoleClient();
  
  // Check if this observation already exists
  const existing = existingObservations?.find(
    o => o.user_id === observation.userId && 
         o.observation_type === observation.observationType &&
         o.observation === observation.observation
  );
  
  if (existing) {
    // Update existing observation
    await supabase
      .from("behavioral_observations")
      .update({
        last_seen: new Date().toISOString(),
        occurrence_count: (existing.occurrence_count as number) + 1,
        confidence: observation.confidence,
        metadata: observation.metadata,
      })
      .eq("id", existing.id);
  } else {
    // Create new observation
    await supabase
      .from("behavioral_observations")
      .insert({
        user_id: observation.userId,
        observation_type: observation.observationType,
        observation: observation.observation,
        confidence: observation.confidence,
        metadata: observation.metadata,
      });
  }
}

/**
 * Get recent behavioral observations for a user
 * Used to build longitudinal intelligence in prompts
 */
export async function getRecentObservations(
  userId: string,
  limit = 10
): Promise<BehavioralObservation[]> {
  const supabase = await createServiceRoleClient();
  
  const { data } = await supabase
    .from("behavioral_observations")
    .select("*")
    .eq("user_id", userId)
    .order("confidence", { ascending: false })
    .order("last_seen", { ascending: false })
    .limit(limit);
  
  if (!data) return [];
  
  return data.map(d => ({
    id: d.id,
    userId: d.user_id,
    observationType: d.observation_type as BehavioralObservation["observationType"],
    observation: d.observation,
    firstSeen: new Date(d.first_seen),
    lastSeen: new Date(d.last_seen),
    occurrenceCount: d.occurrence_count,
    confidence: d.confidence,
    metadata: d.metadata,
  }));
}

/**
 * Format observations for prompt injection
 * This is where longitudinal intelligence becomes visible
 */
export function formatObservationsForPrompt(
  observations: BehavioralObservation[]
): string {
  if (observations.length === 0) return "";
  
  const parts: string[] = ["## Longitudinal Patterns (Observed Over Time)"];
  
  // Group by type
  const byType = observations.reduce((acc, obs) => {
    if (!acc[obs.observationType]) acc[obs.observationType] = [];
    acc[obs.observationType].push(obs);
    return acc;
  }, {} as Record<string, BehavioralObservation[]>);
  
  for (const [type, obs] of Object.entries(byType)) {
    const typeLabel = type.replace(/_/g, " ");
    parts.push(`\n${typeLabel.toUpperCase()}:`);
    
    for (const o of obs.slice(0, 2)) { // Max 2 per type
      const daysSince = Math.floor((Date.now() - o.firstSeen.getTime()) / (1000 * 60 * 60 * 24));
      const occurrences = o.occurrenceCount > 1 ? ` (${o.occurrenceCount}x over ${daysSince} days)` : "";
      parts.push(`- ${o.observation}${occurrences}`);
    }
  }
  
  parts.push("\nUse these patterns to provide premium intelligence. Reference them naturally when relevant.");
  
  return parts.join("\n");
}

/**
 * Generate weekly summary insight
 * Called by a scheduled job to create longitudinal intelligence
 */
export async function generateWeeklySummary(userId: string): Promise<string | null> {
  const observations = await getRecentObservations(userId, 20);
  const supabase = await createServiceRoleClient();
  
  if (observations.length < 3) return null; // Not enough data
  
  // Get recent messages for context
  const { data: messages } = await supabase
    .from("messages")
    .select("content, role")
    .eq("user_id", userId)
    .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .order("created_at", { ascending: false })
    .limit(30);
  
  if (!messages || messages.length < 5) return null;
  
  // Build summary of patterns
  const patternSummary = observations
    .slice(0, 5)
    .map(o => `${o.observation} (seen ${o.occurrenceCount}x)`)
    .join("; ");
  
  const summary = `Over the last 7 days: ${patternSummary}`;
  
  // Store as high-importance insight memory
  const { storeMemory } = await import("./memory-engine");
  await storeMemory({
    userId,
    content: `[Weekly Intelligence Summary] ${summary}`,
    memoryType: "insight",
    importance: 0.95,
    metadata: { 
      type: "weekly_summary",
      observation_count: observations.length,
    },
  });
  
  return summary;
}
