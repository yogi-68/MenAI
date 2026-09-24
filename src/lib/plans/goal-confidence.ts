/**
 * Goal Confidence Score — rule-based, no LLM.
 * Measures how well Mettle can personalise the daily plan for a specific goal.
 * Score 0–100: low = generic tasks, high = tasks only a coach who knows you would give.
 */

export interface GoalConfidenceBreakdown {
  total: number;
  deadline: number;   // 0 | 10 | 20
  obstacle: number;   // 0 | 10 | 20
  success: number;    // 0 | 10 | 20
  resources: number;  // 0 | 10 | 20
  history: number;    // 0 | 5 | 15 | 20
  /** Human-readable labels for each factor */
  labels: {
    deadline: string;
    obstacle: string;
    success: string;
    resources: string;
    history: string;
  };
  /** Which factors are missing and what to do about them */
  missingFactors: Array<{ factor: string; question: string; impact: number }>;
  /** Tracks which factors have been addressed via Q&A in the current session */
  answeredFactors?: string[];
}

export interface GoalConfidenceInput {
  targetDate: string | null;
  /** Whether an execution_patterns row exists for this user */
  hasObstacleCategory: boolean;
  /** The actual obstacle description text (for scoring specificity) */
  obstacleDescription?: string | null;
  successCriteria: string | null;
  /** Whether an identity_signals row of type 'available_hours' exists */
  hasAvailableHours: boolean;
  /** Whether budget/tools signals exist */
  hasBudgetOrTools?: boolean;
  /** Number of completed tasks for this specific goal */
  completedTaskCount: number;
  /** Whether the goal target_date is marked as flexible (no specific date) */
  isFlexibleDeadline?: boolean;
}

const MEASURABLE_OUTCOME_PATTERN =
  /\b(\d[\d,.]*\s*(%|k|lakh|crore|usd|inr|₹|\$|clients?|users?|customers?|kg|lbs|km|miles|hours?|days?|weeks?|months?))\b|first\s+\w+|specific\s+\w+/i;

export function computeGoalConfidence(input: GoalConfidenceInput): GoalConfidenceBreakdown {
  // --- Deadline (0/10/20) ---
  let deadline = 0;
  let deadlineLabel = "No deadline set";
  if (input.targetDate) {
    deadline = 20;
    deadlineLabel = "Specific date set";
  } else if (input.isFlexibleDeadline) {
    deadline = 10;
    deadlineLabel = "Flexible timeline";
  }

  // --- Obstacle (0/10/20) ---
  let obstacle = 0;
  let obstacleLabel = "No obstacle identified";
  if (input.hasObstacleCategory) {
    const descLen = (input.obstacleDescription || "").length;
    if (descLen > 50) {
      obstacle = 20;
      obstacleLabel = "Specific obstacle context";
    } else {
      obstacle = 10;
      obstacleLabel = "Obstacle category selected";
    }
  }

  // --- Success definition (0/10/20) ---
  let success = 0;
  let successLabel = "No success criteria";
  const sc = (input.successCriteria || "").trim();
  if (sc.length > 10) {
    if (MEASURABLE_OUTCOME_PATTERN.test(sc)) {
      success = 20;
      successLabel = "Measurable outcome defined";
    } else {
      success = 10;
      successLabel = "Success criteria answered";
    }
  }

  // --- Resources (0/10/20) ---
  let resources = 0;
  let resourcesLabel = "Time/resources unknown";
  if (input.hasAvailableHours) {
    resources = input.hasBudgetOrTools ? 20 : 10;
    resourcesLabel = input.hasBudgetOrTools ? "Time + budget/tools known" : "Available hours known";
  }

  // --- Execution history (0/5/15/20) ---
  let history = 0;
  let historyLabel = "Day 1 — no history yet";
  const c = input.completedTaskCount;
  if (c >= 14) {
    history = 20;
    historyLabel = "14+ days of data";
  } else if (c >= 7) {
    history = 15;
    historyLabel = "7+ days of data";
  } else if (c >= 1) {
    history = 5;
    historyLabel = `${c} task${c > 1 ? "s" : ""} completed`;
  }

  const total = deadline + obstacle + success + resources + history;

  // Build missing factors list
  const missingFactors: GoalConfidenceBreakdown["missingFactors"] = [];
  if (deadline < 20) {
    missingFactors.push({
      factor: "deadline",
      question: "By when do you need this done? Give me a specific date or month — even a rough one is fine.",
      impact: 20 - deadline,
    });
  }
  if (obstacle < 20) {
    missingFactors.push({
      factor: "obstacle",
      question: "What's the most likely reason you'd fail at this? Not the generic answer — the real one.",
      impact: 20 - obstacle,
    });
  }
  if (success < 20) {
    missingFactors.push({
      factor: "success",
      question: "What's the one number or outcome that would prove to you this worked? Money, clients, weight — be specific.",
      impact: 20 - success,
    });
  }
  if (resources < 10) {
    missingFactors.push({
      factor: "resources",
      question: "How many hours per week can you actually put into this? Be honest — not the ideal, the real number.",
      impact: 10 - resources,
    });
  }

  // Sort by impact descending
  missingFactors.sort((a, b) => b.impact - a.impact);

  return {
    total,
    deadline,
    obstacle,
    success,
    resources,
    history,
    labels: {
      deadline: deadlineLabel,
      obstacle: obstacleLabel,
      success: successLabel,
      resources: resourcesLabel,
      history: historyLabel,
    },
    missingFactors,
  };
}

/** Fetch all DB signals needed to compute confidence and return the breakdown */
export async function fetchAndComputeGoalConfidence(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  userId: string,
  goalId: string,
  goal: { target_date: string | null; success_criteria: string | null }
): Promise<GoalConfidenceBreakdown> {
  const [patternsRes, signalsRes, taskCountRes] = await Promise.all([
    supabase
      .from("execution_patterns")
      .select("pattern, behavioral_impact")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(1),
    supabase
      .from("identity_signals")
      .select("type, description")
      .eq("user_id", userId)
      .eq("status", "active"),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("goal_id", goalId)
      .eq("status", "completed"),
  ]);

  const patterns = (patternsRes.data || []) as Array<{ pattern: string; behavioral_impact: string | null }>;
  const signals = (signalsRes.data || []) as Array<{ type: string; description: string | null }>;
  const hasObstacleCategory = patterns.length > 0;
  const obstacleDescription = patterns[0]?.behavioral_impact || null;
  const hasAvailableHours = signals.some((s) => s.type === "available_hours");
  const hasBudgetOrTools = signals.some((s) =>
    ["budget", "tools", "budget_constraint"].includes(s.type)
  );

  return computeGoalConfidence({
    targetDate: goal.target_date,
    hasObstacleCategory,
    obstacleDescription,
    successCriteria: goal.success_criteria,
    hasAvailableHours,
    hasBudgetOrTools,
    completedTaskCount: taskCountRes.count ?? 0,
  });
}
