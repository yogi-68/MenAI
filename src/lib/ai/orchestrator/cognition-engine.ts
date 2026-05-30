/**
 * Cognition Engine — The Brain of MenAI
 *
 * This is the SINGLE source of truth for a user's cognitive state.
 * Every feature consumes THIS — not raw DB calls.
 *
 * Architecture:
 *   signal → cognition → adaptation
 *
 * Fast Path (chat, dashboard, tasks):
 *   Redis snapshot → return immediately
 *
 * Deep Path (nightly synthesis, weekly reports, onboarding completion):
 *   Full DB scan → LLM synthesis → persist to DB + Redis
 *
 * RULE: buildCognitiveState() is called ONCE per request.
 *       Everything downstream receives the result.
 */

import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  getFromCache,
  setInCache,
  REDIS_KEYS,
  CACHE_TTL,
  invalidateUserCache,
} from "@/lib/redis/client";

// ===== DB ROW TYPES (snake_case — matches Supabase column names) =====
// These are NOT the orchestrator types (which use camelCase).
// Using raw DB shapes avoids type conversion errors.

interface DbGoal {
  id: string;
  title: string;
  category: string;
  priority: string;
  progress: number;
  status: string;
  created_at: string;
}

interface DbTask {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  priority: string | null;
  estimated_minutes: number | null;
  auto_generated: boolean;
  created_at: string;
  completed_at: string | null;
}

interface DbCommitment {
  id: string;
  description: string;
  category: string;
  status: string;
  consistency_score: number;
  times_followed_through: number;
  times_broken: number;
  created_at: string;
}

interface DbPattern {
  pattern: string;
  severity: string;
  behavioral_impact: string;
  occurrences: number;
  confidence: number;
}

interface DbIdentitySignal {
  type: string;
  description: string;
  long_term_direction: string | null;
  confidence: number;
}

interface DbPrediction {
  id: string;
  prediction_type: string;
  trigger_condition: string;
  predicted_behavior: string;
  status: string;
  confidence: number;
  created_at: string;
}

interface DbMemory {
  content: string;
  memory_type: string;
  created_at: string;
}

// ===== COGNITIVE STATE TYPE =====
// This is the full "brain dump" of what MenAI knows about a user right now.

export interface CognitiveState {
  // === DIRECTION ===
  direction: string;                     // Synthesized life direction sentence

  // === STRUCTURED DATA ===
  active_goals: CognitiveGoal[];
  main_patterns: CognitivePattern[];
  unfinished_commitments: CognitiveCommitment[];
  identity_signals: CognitiveIdentity[];

  // === DYNAMIC STATE (computed) ===
  momentum_state: MomentumState;
  energy_state: EnergyState;
  focus_stability: FocusStability;
  sleep_state: SleepState;
  emotional_load: EmotionalLoad;
  task_pressure_level: TaskPressure;

  // === WEAKNESS DETECTION ===
  detected_weaknesses: DetectedWeakness[];

  // === CONTEXT MATURITY ===
  maturity_level: "new" | "developing" | "established" | "deep";
  data_points: number;                   // Total signals collected

  // === METADATA ===
  last_updated: string;
  cache_age_seconds: number;
}

// Sub-types for clarity
export interface CognitiveGoal {
  id: string;
  title: string;
  category: string;
  priority: string;
  progress: number;
  days_active: number;
}

export interface CognitivePattern {
  pattern: string;
  severity: string;
  behavioral_impact: string;
  occurrences: number;
}

export interface CognitiveCommitment {
  id: string;
  description: string;
  consistency_score: number;
  status: "holding" | "slipping" | "broken";
}

export interface CognitiveIdentity {
  type: string;
  description: string;
  long_term_direction: string;
  confidence: number;
}

export type MomentumState = "surging" | "building" | "stable" | "stalling" | "declining" | "unknown";
export type EnergyState = "high" | "moderate" | "low" | "depleted" | "unknown";
export type FocusStability = "locked_in" | "stable" | "scattered" | "fragmented" | "unknown";
export type SleepState = "healthy" | "irregular" | "deprived" | "unknown";
export type EmotionalLoad = "light" | "moderate" | "heavy" | "overwhelming" | "unknown";
export type TaskPressure = "minimal" | "manageable" | "high" | "critical" | "unknown";

export interface DetectedWeakness {
  type: "overthinking" | "burnout" | "distraction" | "inconsistency" | "perfectionism"
    | "emotional_crash" | "avoidance" | "sleep_deprivation" | "overcommitting";
  severity: "low" | "medium" | "high";
  evidence: string;
  adaptation_hint: string;
}

// ===== MAIN ENTRY POINT =====

/**
 * Build the complete cognitive state for a user.
 * This is the ONE function everything calls.
 *
 * Fast Path: Returns cached state from Redis if fresh.
 * Slow Path: Rebuilds from DB when cache is stale.
 */
export async function buildCognitiveState(userId: string): Promise<CognitiveState> {
  // 1. Try Redis cache first (Fast Path)
  const cacheKey = REDIS_KEYS.SESSION_CONTEXT(userId) + ":cognition";
  const cached = await getFromCache<CognitiveState>(cacheKey);

  if (cached && cached.cache_age_seconds < CACHE_TTL.SESSION_CONTEXT) {
    const age = Math.floor((Date.now() - new Date(cached.last_updated).getTime()) / 1000);
    return { ...cached, cache_age_seconds: age };
  }

  // 2. Cache miss — rebuild from DB
  const state = await _rebuildCognitiveState(userId);

  // 3. Store in Redis
  await setInCache(cacheKey, state, CACHE_TTL.SESSION_CONTEXT);

  return state;
}

/**
 * Force a full cognitive state rebuild (Deep Path).
 * Called by synthesis workers, not by request handlers.
 */
export async function rebuildAndPersistCognitiveState(userId: string): Promise<CognitiveState> {
  const state = await _rebuildCognitiveState(userId);

  // Persist to DB for durability across Redis evictions
  const supabase = await createServiceRoleClient();
  await supabase
    .from("profiles")
    .update({ cognitive_state: state, updated_at: new Date().toISOString() })
    .eq("id", userId);

  // Update Redis cache
  const cacheKey = REDIS_KEYS.SESSION_CONTEXT(userId) + ":cognition";
  await setInCache(cacheKey, state, CACHE_TTL.SESSION_CONTEXT);

  return state;
}

/**
 * Invalidate the cognitive state cache for a user.
 * Call after any data mutation (goal created, task completed, chat extraction, etc.)
 */
export async function invalidateCognitiveState(userId: string): Promise<void> {
  await invalidateUserCache(userId);
}

// ===== INTERNAL: REBUILD FROM DB =====

async function _rebuildCognitiveState(userId: string): Promise<CognitiveState> {
  const supabase = await createServiceRoleClient();

  // Load everything in parallel
  const [
    goalsRes,
    tasksRes,
    commitmentsRes,
    patternsRes,
    identityRes,
    predictionsRes,
    recentMemoriesRes,
    profileRes,
  ] = await Promise.all([
    supabase
      .from("goals")
      .select("id, title, category, priority, progress, status, created_at")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("priority", { ascending: false })
      .limit(10),
    supabase
      .from("tasks")
      .select("id, title, status, due_date, priority, estimated_minutes, auto_generated, created_at, completed_at")
      .eq("user_id", userId)
      .order("due_date", { ascending: true })
      .limit(50),
    supabase
      .from("commitments")
      .select("id, description, category, status, consistency_score, times_followed_through, times_broken, created_at")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(10),
    supabase
      .from("execution_patterns")
      .select("pattern, severity, behavioral_impact, occurrences, confidence")
      .eq("user_id", userId)
      .order("confidence", { ascending: false })
      .limit(10),
    supabase
      .from("identity_signals")
      .select("type, description, long_term_direction, confidence")
      .eq("user_id", userId)
      .order("confidence", { ascending: false })
      .limit(5),
    supabase
      .from("behavioral_predictions")
      .select("id, prediction_type, trigger_condition, predicted_behavior, status, confidence, created_at")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(5),
    supabase
      .from("memories")
      .select("content, memory_type, created_at")
      .eq("user_id", userId)
      .in("memory_type", ["conversation", "insight", "behavioral", "mood"])
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("profiles")
      .select("full_name, vision, founder_mode, coaching_style, cognitive_state")
      .eq("id", userId)
      .single(),
  ]);

  const goals = (goalsRes.data || []) as DbGoal[];
  const tasks = (tasksRes.data || []) as DbTask[];
  const commitments = (commitmentsRes.data || []) as DbCommitment[];
  const patterns = (patternsRes.data || []) as DbPattern[];
  const identitySignals = (identityRes.data || []) as DbIdentitySignal[];
  const predictions = (predictionsRes.data || []) as DbPrediction[];
  const recentMemories = (recentMemoriesRes.data || []) as DbMemory[];
  const profile = (profileRes.data || {}) as Record<string, unknown>;

  // ===== COMPUTE COGNITIVE DIMENSIONS =====

  const direction = _computeDirection(goals, identitySignals, commitments, profile);
  const cognitiveGoals = _mapGoals(goals);
  const cognitivePatterns = _mapPatterns(patterns);
  const cognitiveCommitments = _mapCommitments(commitments);
  const cognitiveIdentity = _mapIdentity(identitySignals);

  const momentumState = _computeMomentum(tasks, commitments);
  const energyState = _computeEnergy(recentMemories, tasks);
  const focusStability = _computeFocusStability(goals, tasks);
  const sleepState = _computeSleepState(recentMemories);
  const emotionalLoad = _computeEmotionalLoad(recentMemories, predictions);
  const taskPressure = _computeTaskPressure(tasks);
  const detectedWeaknesses = _detectWeaknesses(patterns, tasks, commitments, recentMemories, momentumState);
  const maturityLevel = _computeMaturity(goals, commitments, patterns, identitySignals, recentMemories);
  const dataPoints = goals.length + tasks.length + commitments.length + patterns.length + identitySignals.length + recentMemories.length;

  return {
    direction,
    active_goals: cognitiveGoals,
    main_patterns: cognitivePatterns,
    unfinished_commitments: cognitiveCommitments,
    identity_signals: cognitiveIdentity,
    momentum_state: momentumState,
    energy_state: energyState,
    focus_stability: focusStability,
    sleep_state: sleepState,
    emotional_load: emotionalLoad,
    task_pressure_level: taskPressure,
    detected_weaknesses: detectedWeaknesses,
    maturity_level: maturityLevel,
    data_points: dataPoints,
    last_updated: new Date().toISOString(),
    cache_age_seconds: 0,
  };
}

// ===== DIMENSION COMPUTATIONS =====

function _computeDirection(
  goals: DbGoal[],
  identitySignals: DbIdentitySignal[],
  commitments: DbCommitment[],
  profile: Record<string, unknown>,
): string {
  const parts: string[] = [];

  // Identity-driven
  if (identitySignals.length > 0) {
    const primary = identitySignals[0];
    if (primary.long_term_direction) {
      parts.push(`Moving toward ${primary.long_term_direction.toLowerCase()}`);
    } else if (primary.type !== "other") {
      parts.push(`Building ${primary.type} identity`);
    }
  }

  // Vision-driven
  const vision = profile.vision as string | undefined;
  if (vision && parts.length === 0) {
    parts.push(vision);
  }

  // Goal-driven
  if (goals.length > 0) {
    const topGoals = goals.slice(0, 2).map(g => g.title.toLowerCase());
    if (topGoals.length === 1) {
      parts.push(`focused on ${topGoals[0]}`);
    } else {
      parts.push(`balancing ${topGoals.join(" and ")}`);
    }
  }

  if (parts.length === 0 && commitments.length > 0) {
    parts.push("Building consistency through active commitments");
  }

  if (parts.length === 0) {
    return "";
  }

  const result = parts.join(", ");
  return result.charAt(0).toUpperCase() + result.slice(1) + ".";
}

function _mapGoals(goals: DbGoal[]): CognitiveGoal[] {
  const now = Date.now();
  return goals.map(g => ({
    id: g.id,
    title: g.title,
    category: g.category,
    priority: g.priority,
    progress: g.progress || 0,
    days_active: Math.floor((now - new Date(g.created_at).getTime()) / (1000 * 60 * 60 * 24)),
  }));
}

function _mapPatterns(patterns: DbPattern[]): CognitivePattern[] {
  return patterns
    .filter(p => p.occurrences >= 2 || p.severity === "high")
    .map(p => ({
      pattern: p.pattern,
      severity: p.severity,
      behavioral_impact: p.behavioral_impact,
      occurrences: p.occurrences || 0,
    }));
}

function _mapCommitments(commitments: DbCommitment[]): CognitiveCommitment[] {
  return commitments.map(c => {
    let status: CognitiveCommitment["status"] = "holding";
    if (c.consistency_score < 30) status = "broken";
    else if (c.consistency_score < 60) status = "slipping";
    return {
      id: c.id,
      description: c.description,
      consistency_score: c.consistency_score || 0,
      status,
    };
  });
}

function _mapIdentity(signals: DbIdentitySignal[]): CognitiveIdentity[] {
  return signals.map(s => ({
    type: s.type,
    description: s.description,
    long_term_direction: s.long_term_direction || "",
    confidence: s.confidence,
  }));
}

function _computeMomentum(
  tasks: DbTask[],
  commitments: DbCommitment[],
): MomentumState {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const recentCompleted = tasks.filter(t =>
    t.status === "completed" && t.completed_at && new Date(t.completed_at) > sevenDaysAgo
  ).length;
  const recentPending = tasks.filter(t =>
    t.status === "pending" || t.status === "in_progress"
  ).length;

  const avgConsistency = commitments.length > 0
    ? commitments.reduce((sum, c) => sum + (c.consistency_score || 0), 0) / commitments.length
    : 50;

  if (recentCompleted >= 5 && avgConsistency >= 70) return "surging";
  if (recentCompleted >= 3 && avgConsistency >= 50) return "building";
  if (recentCompleted >= 1 || avgConsistency >= 40) return "stable";
  if (recentPending > 5 && recentCompleted === 0) return "declining";
  if (recentPending > 0) return "stalling";
  return "unknown";
}

function _computeEnergy(
  memories: DbMemory[],
  _tasks: DbTask[],
): EnergyState {
  const lowEnergySignals = ["tired", "exhausted", "drained", "burned out", "can't focus", "no energy", "fatigue"];
  const highEnergySignals = ["motivated", "energized", "pumped", "fired up", "ready to go", "feeling great"];

  let lowCount = 0;
  let highCount = 0;

  for (const m of memories.slice(0, 10)) {
    const lower = m.content.toLowerCase();
    if (lowEnergySignals.some(s => lower.includes(s))) lowCount++;
    if (highEnergySignals.some(s => lower.includes(s))) highCount++;
  }

  if (lowCount >= 3) return "depleted";
  if (lowCount >= 1 && highCount === 0) return "low";
  if (highCount >= 2) return "high";
  if (highCount >= 1 || lowCount === 0) return "moderate";
  return "unknown";
}

function _computeFocusStability(goals: DbGoal[], tasks: DbTask[]): FocusStability {
  const activeGoalCount = goals.length;
  const pendingTaskCount = tasks.filter(t => t.status === "pending" || t.status === "in_progress").length;

  if (activeGoalCount <= 2 && pendingTaskCount <= 5) return "locked_in";
  if (activeGoalCount <= 4 && pendingTaskCount <= 10) return "stable";
  if (activeGoalCount <= 6 || pendingTaskCount <= 20) return "scattered";
  if (activeGoalCount > 6) return "fragmented";
  return "unknown";
}

function _computeSleepState(memories: { content: string }[]): SleepState {
  const deprivedSignals = ["3am", "4am", "5am", "can't sleep", "insomnia", "stayed up", "no sleep", "slept 3", "slept 4"];
  const irregularSignals = ["weird sleep", "sleep schedule", "woke up late", "overslept", "napped"];
  const healthySignals = ["slept well", "good sleep", "8 hours", "well rested"];

  let deprivedCount = 0;
  let irregularCount = 0;
  let healthyCount = 0;

  for (const m of memories.slice(0, 15)) {
    const lower = m.content.toLowerCase();
    if (deprivedSignals.some(s => lower.includes(s))) deprivedCount++;
    if (irregularSignals.some(s => lower.includes(s))) irregularCount++;
    if (healthySignals.some(s => lower.includes(s))) healthyCount++;
  }

  if (deprivedCount >= 2) return "deprived";
  if (irregularCount >= 2) return "irregular";
  if (healthyCount >= 1) return "healthy";
  return "unknown";
}

function _computeEmotionalLoad(
  memories: DbMemory[],
  predictions: DbPrediction[],
): EmotionalLoad {
  const heavySignals = ["overwhelmed", "anxious", "stressed", "crying", "panic", "breaking down", "can't handle"];
  const moderateSignals = ["worried", "frustrated", "uncertain", "unsure", "confused"];

  let heavyCount = 0;
  let moderateCount = 0;

  for (const m of memories.slice(0, 10)) {
    const lower = m.content.toLowerCase();
    if (heavySignals.some(s => lower.includes(s))) heavyCount++;
    if (moderateSignals.some(s => lower.includes(s))) moderateCount++;
  }

  // Factor in active risk predictions
  const riskPredictions = predictions.filter(p =>
    p.prediction_type === "burnout_risk" || p.prediction_type === "momentum_collapse"
  );
  if (riskPredictions.length > 0) heavyCount++;

  if (heavyCount >= 3) return "overwhelming";
  if (heavyCount >= 1) return "heavy";
  if (moderateCount >= 2) return "moderate";
  return "light";
}

function _computeTaskPressure(tasks: DbTask[]): TaskPressure {
  const today = new Date().toISOString().split("T")[0];
  const pending = tasks.filter(t => t.status === "pending" || t.status === "in_progress");
  const overdue = pending.filter(t => t.due_date && t.due_date < today);
  const dueToday = pending.filter(t => t.due_date === today);

  const totalMinutesToday = dueToday.reduce((sum, t) => sum + (t.estimated_minutes || 30), 0);

  if (overdue.length >= 5 || totalMinutesToday > 480) return "critical";
  if (overdue.length >= 2 || totalMinutesToday > 300) return "high";
  if (pending.length > 5 || totalMinutesToday > 120) return "manageable";
  return "minimal";
}

// ===== WEAKNESS DETECTION =====

function _detectWeaknesses(
  patterns: DbPattern[],
  tasks: DbTask[],
  commitments: DbCommitment[],
  memories: DbMemory[],
  momentum: MomentumState,
): DetectedWeakness[] {
  const weaknesses: DetectedWeakness[] = [];

  // From established patterns
  for (const p of patterns) {
    if (p.severity === "high" || (p.occurrences || 0) >= 3) {
      const weaknessMap: Record<string, DetectedWeakness["type"]> = {
        burnout: "burnout",
        procrastination: "avoidance",
        avoidance: "avoidance",
        perfectionism: "perfectionism",
        scattered_focus: "distraction",
        inconsistency: "inconsistency",
        overthinking: "overthinking",
      };
      const type = weaknessMap[p.pattern];
      if (type) {
        weaknesses.push({
          type,
          severity: p.severity as "low" | "medium" | "high",
          evidence: p.behavioral_impact,
          adaptation_hint: _getAdaptationHint(type),
        });
      }
    }
  }

  // Overcommitting detection
  const today = new Date().toISOString().split("T")[0];
  const overdueTasks = tasks.filter(t =>
    (t.status === "pending" || t.status === "in_progress") && t.due_date && t.due_date < today
  );
  if (overdueTasks.length >= 5) {
    weaknesses.push({
      type: "overcommitting",
      severity: overdueTasks.length >= 8 ? "high" : "medium",
      evidence: `${overdueTasks.length} overdue tasks piling up`,
      adaptation_hint: "Reduce task load. Complete or remove stale items before adding new ones.",
    });
  }

  // Sleep deprivation from memories
  const sleepSignals = memories.filter(m =>
    /3am|4am|5am|can't sleep|insomnia|stayed up all night|no sleep/i.test(m.content)
  );
  if (sleepSignals.length >= 2) {
    weaknesses.push({
      type: "sleep_deprivation",
      severity: sleepSignals.length >= 4 ? "high" : "medium",
      evidence: "Multiple late-night or poor sleep signals detected",
      adaptation_hint: "Lighter tasks tomorrow. Protect sleep as a non-negotiable.",
    });
  }

  // Emotional crash from momentum collapse
  if (momentum === "declining") {
    const slippingCommitments = commitments.filter(c => c.consistency_score < 40);
    if (slippingCommitments.length >= 2) {
      weaknesses.push({
        type: "emotional_crash",
        severity: "medium",
        evidence: "Momentum declining with multiple commitments slipping",
        adaptation_hint: "Pause new commitments. Stabilize what exists before adding more.",
      });
    }
  }

  return weaknesses;
}

function _getAdaptationHint(type: DetectedWeakness["type"]): string {
  const hints: Record<string, string> = {
    overthinking: "Reduce scope. Ship something small today instead of planning more.",
    burnout: "Mandatory lighter day. Recovery is productive.",
    distraction: "Close everything except one task. Single-thread for 60 minutes.",
    inconsistency: "Pick one commitment. Do it for 7 days straight. Nothing else matters.",
    perfectionism: "Ship at 80%. Done beats perfect.",
    emotional_crash: "Pause execution. Process what you're feeling first.",
    avoidance: "Name what you're avoiding. Start with just 5 minutes on it.",
    sleep_deprivation: "No deep work after 10pm. Sleep is your highest-leverage activity.",
    overcommitting: "Cut 3 tasks right now. You're carrying more than you can execute.",
  };
  return hints[type] || "Adapt your approach based on what's actually working.";
}

// ===== MATURITY COMPUTATION =====

function _computeMaturity(
  goals: DbGoal[],
  commitments: DbCommitment[],
  patterns: DbPattern[],
  identitySignals: DbIdentitySignal[],
  memories: DbMemory[],
): CognitiveState["maturity_level"] {
  const totalSignals = goals.length + commitments.length + patterns.length + identitySignals.length + memories.length;

  if (totalSignals >= 30 && patterns.length >= 3 && identitySignals.length >= 2) return "deep";
  if (totalSignals >= 15 && (patterns.length >= 1 || identitySignals.length >= 1)) return "established";
  if (totalSignals >= 5) return "developing";
  return "new";
}

// ===== FORMAT FOR DASHBOARD =====

/**
 * Generate a human-readable dashboard message based on cognitive state.
 * Returns different text for new users vs advanced users.
 */
export function formatCognitiveStateForDashboard(state: CognitiveState): {
  greeting_context: string;
  direction_text: string;
  observation: string | null;
  momentum_text: string | null;
  weakness_text: string | null;
} {
  // New user — minimal data
  if (state.maturity_level === "new") {
    return {
      greeting_context: "You're still getting started. MenAI will learn how you work over time.",
      direction_text: state.direction,
      observation: null,
      momentum_text: null,
      weakness_text: null,
    };
  }

  // Developing user — some patterns emerging
  if (state.maturity_level === "developing") {
    return {
      greeting_context: "Patterns are starting to form. Keep sharing what's on your mind.",
      direction_text: state.direction,
      observation: state.main_patterns.length > 0
        ? `Early pattern: ${state.main_patterns[0].behavioral_impact}`
        : null,
      momentum_text: _formatMomentum(state.momentum_state),
      weakness_text: null,
    };
  }

  // Established / Deep user — full intelligence
  const topWeakness = state.detected_weaknesses.length > 0
    ? state.detected_weaknesses.sort((a, b) => {
        const sev = { high: 3, medium: 2, low: 1 };
        return (sev[b.severity] || 0) - (sev[a.severity] || 0);
      })[0]
    : null;

  return {
    greeting_context: _buildSmartGreeting(state),
    direction_text: state.direction,
    observation: state.main_patterns.length > 0
      ? state.main_patterns[0].behavioral_impact
      : null,
    momentum_text: _formatMomentum(state.momentum_state),
    weakness_text: topWeakness
      ? topWeakness.adaptation_hint
      : null,
  };
}

function _formatMomentum(momentum: MomentumState): string | null {
  const texts: Record<MomentumState, string | null> = {
    surging: "Based on recent activity, execution momentum looks strong.",
    building: "Based on recent activity, momentum is building through consistent action.",
    stable: "Based on available data, progress appears steady.",
    stalling: "Based on limited recent activity, momentum may be slowing.",
    declining: "Based on available data, execution activity appears to be dropping.",
    unknown: null,
  };
  return texts[momentum];
}

function _buildSmartGreeting(state: CognitiveState): string {
  if (state.task_pressure_level === "critical") {
    return "You're carrying a lot right now. Let's focus on what actually matters today.";
  }
  if (state.momentum_state === "surging") {
    return "You're in a strong rhythm. Don't break the chain.";
  }
  if (state.emotional_load === "heavy" || state.emotional_load === "overwhelming") {
    return "It looks like things are weighing on you. Take it one step at a time.";
  }
  if (state.focus_stability === "fragmented") {
    return "You lose momentum when too many goals stay active at once.";
  }
  if (state.detected_weaknesses.some(w => w.type === "sleep_deprivation")) {
    return "Sleep debt is affecting your capacity. Lighter load today.";
  }
  return "Here is your current trajectory.";
}

// ===== FORMAT FOR AI PROMPT =====

/**
 * Compact cognitive state injection for LLM prompts.
 * Replaces scattered context gathering.
 */
export function formatCognitiveStateForPrompt(state: CognitiveState): string {
  const parts: string[] = [];

  parts.push(`## User Cognitive State`);
  parts.push(`Direction: ${state.direction}`);
  parts.push(`Maturity: ${state.maturity_level} (${state.data_points} data points)`);

  if (state.active_goals.length > 0) {
    parts.push(`Active Goals: ${state.active_goals.map(g => `${g.title} (${g.priority})`).join(", ")}`);
  }

  parts.push(`Momentum: ${state.momentum_state}`);
  parts.push(`Energy: ${state.energy_state}`);
  parts.push(`Focus: ${state.focus_stability}`);
  parts.push(`Task Pressure: ${state.task_pressure_level}`);
  parts.push(`Emotional Load: ${state.emotional_load}`);

  if (state.main_patterns.length > 0) {
    parts.push(`Known Patterns: ${state.main_patterns.map(p => `${p.pattern} (${p.severity})`).join(", ")}`);
  }

  if (state.detected_weaknesses.length > 0) {
    const top = state.detected_weaknesses.slice(0, 2);
    parts.push(`Active Weaknesses: ${top.map(w => `${w.type}: ${w.evidence}`).join("; ")}`);
  }

  if (state.unfinished_commitments.length > 0) {
    const slipping = state.unfinished_commitments.filter(c => c.status === "slipping" || c.status === "broken");
    if (slipping.length > 0) {
      parts.push(`Slipping Commitments: ${slipping.map(c => c.description).join(", ")}`);
    }
  }

  if (state.sleep_state !== "unknown") {
    parts.push(`Sleep: ${state.sleep_state}`);
  }

  return parts.join("\n");
}
