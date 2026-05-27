/**
 * Dashboard Intelligence Synthesis
 * 
 * Real cognition synthesis from behavioral signals.
 * NEVER fake data - everything derives from actual user data.
 */

import { createClient } from "@/lib/supabase/client";

export interface DashboardIntelligence {
  currentDirection: string;
  aiObservation: string | null;
  activeFocus: string[];
  suggestedNextSteps: string[];
  momentumTrend: string | null;
}

interface Goal {
  id: string;
  title: string;
  category: string;
  priority: string;
}

interface ExecutionPattern {
  pattern: string;
  trigger: string | null;
  frequency: string;
  severity: string;
  behavioral_impact: string;
  occurrences: number;
}

interface IdentitySignal {
  type: string;
  description: string;
  long_term_direction: string | null;
  confidence: number;
}

interface Task {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
}

interface Commitment {
  id: string;
  description: string;
  consistency_score: number;
  times_followed_through: number;
  times_broken: number;
}

/**
 * Synthesize Current Direction from goals + identity signals + commitments
 */
export async function synthesizeCurrentDirection(userId: string): Promise<string> {
  const supabase = createClient();
  
  const [goalsRes, identityRes, commitmentsRes] = await Promise.allSettled([
    supabase
      .from("goals")
      .select("id, title, category, priority")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("priority", { ascending: false })
      .limit(5),
    supabase
      .from("identity_signals")
      .select("type, description, long_term_direction, confidence")
      .eq("user_id", userId)
      .gte("confidence", 0.65)
      .order("confidence", { ascending: false })
      .limit(3),
    supabase
      .from("commitments")
      .select("id, description")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(3),
  ]);

  const goals = goalsRes.status === "fulfilled" ? (goalsRes.value.data as Goal[] || []) : [];
  const identitySignals = identityRes.status === "fulfilled" ? (identityRes.value.data as IdentitySignal[] || []) : [];
  const commitments = commitmentsRes.status === "fulfilled" ? (commitmentsRes.value.data || []) : [];

  // No data yet - return organic empty state
  if (goals.length === 0 && identitySignals.length === 0 && commitments.length === 0) {
    return "Your trajectory emerges through conversation. Share what you're working toward, and MenAI will help you maintain focus.";
  }

  // Synthesize from available data
  const parts: string[] = [];

  // Identity-driven direction
  if (identitySignals.length > 0) {
    const primaryIdentity = identitySignals[0];
    if (primaryIdentity.long_term_direction) {
      parts.push(`Moving toward ${primaryIdentity.long_term_direction.toLowerCase()}`);
    } else if (primaryIdentity.type !== "other") {
      parts.push(`Building ${primaryIdentity.type} identity`);
    }
  }

  // Goal-driven direction
  if (goals.length > 0) {
    const topGoals = goals.slice(0, 3).map(g => g.title.toLowerCase());
    if (topGoals.length === 1) {
      parts.push(`focused on ${topGoals[0]}`);
    } else if (topGoals.length === 2) {
      parts.push(`working on ${topGoals[0]} and ${topGoals[1]}`);
    } else {
      parts.push(`balancing ${topGoals[0]}, ${topGoals[1]}, and ${topGoals[2]}`);
    }
  }

  // Commitment-driven direction
  if (commitments.length > 0 && parts.length === 0) {
    parts.push(`Committed to ${commitments.length === 1 ? 'building consistency' : 'several commitments'}`);
  }

  if (parts.length === 0) {
    return "Exploring current priorities and direction.";
  }

  // Capitalize first letter
  const synthesized = parts.join(", ");
  return synthesized.charAt(0).toUpperCase() + synthesized.slice(1) + ".";
}

/**
 * Generate AI Observation from execution patterns
 */
export async function generateAIObservation(userId: string): Promise<string | null> {
  const supabase = createClient();
  
  const { data: patterns } = await supabase
    .from("execution_patterns")
    .select("pattern, trigger, frequency, severity, behavioral_impact, occurrences")
    .eq("user_id", userId)
    .gte("occurrences", 2) // At least 2 occurrences
    .order("severity", { ascending: false })
    .order("occurrences", { ascending: false })
    .limit(1);

  if (!patterns || patterns.length === 0) {
    return null;
  }

  const pattern = patterns[0] as ExecutionPattern;

  // Generate observation based on pattern
  const observations: Record<string, string> = {
    overthinking: "You tend to move toward planning when execution pressure increases.",
    procrastination: "Tasks often sit longer than intended before you engage with them.",
    perfectionism: "You hesitate to ship until everything feels completely ready.",
    avoidance: "Certain types of work consistently get deferred when they surface.",
    burnout: "Intensity often builds until it forces a pause rather than sustainable rhythm.",
    scattered_focus: "Your attention shifts frequently before work reaches completion.",
    inconsistency: "Follow-through varies significantly across different contexts.",
  };

  return observations[pattern.pattern] || null;
}

/**
 * Generate Active Focus from tasks + goals
 */
export async function synthesizeActiveFocus(userId: string): Promise<string[]> {
  const supabase = createClient();
  
  const [tasksRes, goalsRes] = await Promise.allSettled([
    supabase
      .from("tasks")
      .select("id, title, status, due_date")
      .eq("user_id", userId)
      .in("status", ["pending", "in_progress"])
      .order("due_date", { ascending: true })
      .limit(5),
    supabase
      .from("goals")
      .select("id, title, category, priority")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("priority", { ascending: false })
      .limit(3),
  ]);

  const tasks = tasksRes.status === "fulfilled" ? (tasksRes.value.data as Task[] || []) : [];
  const goals = goalsRes.status === "fulfilled" ? (goalsRes.value.data as Goal[] || []) : [];

  const focus: string[] = [];

  // Add tasks first (immediate execution)
  tasks.slice(0, 3).forEach(task => {
    focus.push(task.title);
  });

  // Add goals if we have space
  if (focus.length < 3) {
    goals.slice(0, 3 - focus.length).forEach(goal => {
      focus.push(goal.title);
    });
  }

  return focus;
}

/**
 * Generate Suggested Next Steps from context
 */
export async function generateSuggestedNextSteps(userId: string): Promise<string[]> {
  const supabase = createClient();
  
  const [patternsRes, tasksRes, goalsRes] = await Promise.allSettled([
    supabase
      .from("execution_patterns")
      .select("pattern, trigger, behavioral_impact, severity")
      .eq("user_id", userId)
      .order("severity", { ascending: false })
      .limit(1),
    supabase
      .from("tasks")
      .select("id")
      .eq("user_id", userId)
      .in("status", ["pending", "in_progress"]),
    supabase
      .from("goals")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "active"),
  ]);

  const patterns = patternsRes.status === "fulfilled" ? (patternsRes.value.data || []) : [];
  const tasksCount = tasksRes.status === "fulfilled" ? (tasksRes.value.data?.length || 0) : 0;
  const goalsCount = goalsRes.status === "fulfilled" ? (goalsRes.value.data?.length || 0) : 0;

  const suggestions: string[] = [];

  // Pattern-based suggestions
  if (patterns.length > 0) {
    const pattern = patterns[0] as ExecutionPattern;
    const patternSuggestions: Record<string, string> = {
      overthinking: "Reduce MVP scope to one usable workflow",
      procrastination: "Start with smallest viable step today",
      perfectionism: "Ship something incomplete but functional",
      avoidance: "Identify what you're delaying and why",
      burnout: "Protect focused execution blocks, stop work before midnight",
      scattered_focus: "Finish one thing before starting another",
      inconsistency: "Choose one core workflow to commit to for 7 days",
    };
    
    const suggestion = patternSuggestions[pattern.pattern];
    if (suggestion) {
      suggestions.push(suggestion);
    }
  }

  // Context-based suggestions
  if (goalsCount === 0) {
    suggestions.push("Define one clear direction to commit to");
  } else if (goalsCount > 5) {
    suggestions.push("Narrow focus to 2-3 high-priority goals");
  }

  if (tasksCount === 0 && goalsCount > 0) {
    suggestions.push("Break goals into concrete next actions");
  }

  // Default if no specific suggestions
  if (suggestions.length === 0) {
    suggestions.push("Continue deepening your trajectory through conversation");
  }

  return suggestions.slice(0, 3);
}

/**
 * Calculate Momentum Trend from task completion + commitment follow-through
 */
export async function calculateMomentumTrend(userId: string): Promise<string | null> {
  const supabase = createClient();
  
  // Get recent task completion rate
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [completedRes, totalRes, commitmentsRes] = await Promise.allSettled([
    supabase
      .from("tasks")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "completed")
      .gte("created_at", thirtyDaysAgo.toISOString()),
    supabase
      .from("tasks")
      .select("id")
      .eq("user_id", userId)
      .gte("created_at", thirtyDaysAgo.toISOString()),
    supabase
      .from("commitments")
      .select("consistency_score, times_followed_through, times_broken")
      .eq("user_id", userId)
      .eq("status", "active"),
  ]);

  const completedCount = completedRes.status === "fulfilled" ? (completedRes.value.data?.length || 0) : 0;
  const totalCount = totalRes.status === "fulfilled" ? (totalRes.value.data?.length || 0) : 0;
  const commitments = commitmentsRes.status === "fulfilled" ? (commitmentsRes.value.data as Commitment[] || []) : [];

  // Not enough data yet
  if (totalCount === 0 && commitments.length === 0) {
    return null;
  }

  // Calculate completion rate
  const taskCompletionRate = totalCount > 0 ? completedCount / totalCount : 0;

  // Calculate commitment follow-through rate
  let commitmentRate = 0;
  if (commitments.length > 0) {
    const totalCommitmentActions = commitments.reduce(
      (sum, c) => sum + c.times_followed_through + c.times_broken,
      0
    );
    const totalFollowThrough = commitments.reduce((sum, c) => sum + c.times_followed_through, 0);
    commitmentRate = totalCommitmentActions > 0 ? totalFollowThrough / totalCommitmentActions : 0;
  }

  // Overall momentum score
  const momentumScore = (taskCompletionRate + commitmentRate) / 2;

  if (momentumScore >= 0.7) {
    return "Momentum building through consistent execution";
  } else if (momentumScore >= 0.4) {
    return "Steady progress with room for more consistency";
  } else if (momentumScore > 0) {
    return "Early momentum — focus on follow-through";
  }

  return null;
}

/**
 * Generate full dashboard intelligence
 */
export async function generateDashboardIntelligence(userId: string): Promise<DashboardIntelligence> {
  const [direction, observation, focus, nextSteps, momentum] = await Promise.all([
    synthesizeCurrentDirection(userId),
    generateAIObservation(userId),
    synthesizeActiveFocus(userId),
    generateSuggestedNextSteps(userId),
    calculateMomentumTrend(userId),
  ]);

  return {
    currentDirection: direction,
    aiObservation: observation,
    activeFocus: focus,
    suggestedNextSteps: nextSteps,
    momentumTrend: momentum,
  };
}
