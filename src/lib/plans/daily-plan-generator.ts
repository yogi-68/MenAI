import { getOpenAI } from "@/lib/ai/openai";
import { FAST_MODEL } from "@/lib/ai/models";
import {
  computePlanConfidence,
  type PlanConfidence,
} from "@/lib/plans/plan-confidence";
import { computeGoalHealth } from "@/lib/plans/goal-health";
import {
  computeLifeAreaBalance,
  formatBalanceInsight,
  lifeAreaLabel,
} from "@/lib/plans/life-areas";
import { fetchTimeEstimationProfile, adjustMinutesForUser } from "@/lib/plans/time-estimation";
import { fetchExecutionMetrics } from "@/lib/plans/execution-rate";
import { recordPlanGeneration } from "@/lib/plans/momentum-score";
import { logAiUsage, checkAiQuota, AI_UNAVAILABLE_MESSAGE } from "@/lib/ai/usage-guard";
import {
  buildPlanEvidence,
} from "@/lib/plans/language-guard";
import { trackProductEventOnce } from "@/lib/analytics/track-event";
import { buildPatternGuidanceLines } from "@/lib/plans/pattern-task-guidance";
import {
  computeLifeAreaWeights,
  formatLifeAreaPlanStructure,
} from "@/lib/plans/life-area-balancer";
import {
  formatWeaknessProfilesForPrompt,
  loadWeaknessProfiles,
} from "@/lib/mentor/weakness-engine";
import { formatMentorMemoriesForPrompt, loadMentorMemories } from "@/lib/mentor/mentor-memory";
import { fetchActiveExecutionGoals, countActiveExecutionGoals } from "@/lib/goals/active-goals";
import { loadMemoryRetrievalContext } from "@/lib/mentor/memory-retrieval";
import { TASK_QUALITY_PROMPT, passesTaskQualityGate } from "@/lib/plans/task-quality";
import {
  buildPlanContextSnapshot,
  improvementHints,
  type PlanContextSnapshot,
} from "@/lib/plans/plan-context-dimensions";
import { loadPlanContextData } from "@/lib/plans/plan-interview";
import {
  loadExecutionContext,
} from "@/lib/user-model/resolve-context";
import { scheduleUserModelRefresh } from "@/lib/user-model/synthesis-engine";
import { getUserModel } from "@/lib/user-model/loader";
import { formatExecutionAllocationForPrompt } from "@/lib/user-model/execution-allocation";
import type { PlanContextData } from "@/lib/plans/plan-interview";
import {
  buildGoalAnalysis,
  COACH_WRITING_RULES,
  detectDomain,
  sanitizeCoachText,
  type GoalAnalysis,
} from "@/lib/plans/coach-insights";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TASKS_PER_GOAL } from "@/lib/plans/performance-score";
import { isVagueTask, isFinishableTodayTask } from "@/lib/tasks/finishable-today";

export type PlanMode = "context_building" | "normal" | "aggressive";

export interface DailyPlanTask {
  title: string;
  whyItMatters: string;
  estimatedMinutes: number;
  deliverable: string;
  successMetric: string;
  isContextBuilding: boolean;
  lifeArea?: string;
  linkedInitiative?: string;
  linkedMilestone?: string;
}

export interface PlanningContextSummary {
  planningQuality: PlanContextSnapshot["planningQuality"];
  dimensions: Array<{ id: string; label: string; satisfied: boolean; gapHint?: string }>;
  improvementHints: string[];
  coachInsight?: string;
  missingLabels?: string[];
  daysRemaining?: number | null;
}

export interface DailyPlanContent {
  daySummary: string;
  whatMattersNow?: string;
  topObstacle?: string;
  whyTheseTasks: string;
  confidence: PlanConfidence;
  planMode: PlanMode;
  planningContext?: PlanningContextSummary;
  assumptions?: string[];
  lifeAreaInsight?: string;
  timeEstimationInsight?: string;
  executionRate7d?: number;
  evidence?: string[];
  tasks: DailyPlanTask[];
}

export type PlanPhase = "morning" | "afternoon" | "night";

export interface FetchPlanOptions {
  middayCompleted?: string[];
  planPhase?: PlanPhase;
}

export interface PlanUserContext {
  initiatives: string[];
  initiativeHealth: string[];
  initiativeMilestones: string[];
  upcomingDeadlines: string[];
  opportunities: string[];
  urgentOpportunities: string[];
  recentReflections: string[];
  lifeAreaBalance: string[];
  goals: string[];
  commitments: string[];
  vision: string;
  currentPriorities: string[];
  currentFocus: string | null;
  currentFocusUntil: string | null;
  unfinishedTasks: string[];
  recentProgress: string[];
  obstacles: string[];
  patternGuidance: string[];
  planContextNotes: string[];
  availableMinutes: number;
  energyLevel: string;
  identityContext: string;
  lifeContext: string;
  confidence: PlanConfidence;
  planMode: PlanMode;
  contextSnapshot: PlanContextSnapshot;
  goalAnalysis: GoalAnalysis | null;
  primaryInitiativeTitle: string | null;
  maxTasks: number;
  timeEstimationRatio: number;
  executionRate7d: number;
  initiativeMap: Map<string, string>;
  activeGoalTitles: string[];
  lifeAreaInsight?: string;
  timeEstimationInsight?: string;
  planPhase: PlanPhase;
  middayCompleted: string[];
  userModelNarrative: string;
  executionAllocationLines: string[];
  initiativeContextBlocks: string[];
  lifeAreaWeightPlan: string;
  mentorMemoryBlock: string;
  memoryPlanningConstraints: string[];
}

function buildDomainScopedContextNotes(
  init: { title: string; description: string | null; life_area: string | null },
  planContext: PlanContextData
): string[] {
  const notes: string[] = [];
  const domain = detectDomain(`${init.title} ${init.description || ""}`, init.life_area);

  if (planContext.biggestObstacle?.trim()) {
    notes.push(`Blocker: ${planContext.biggestObstacle}`);
  }
  if (typeof planContext.weeklyAvailableHours === "number") {
    notes.push(`Weekly capacity: ${planContext.weeklyAvailableHours} hours`);
  }
  if (planContext.initiativeOutcome90d?.trim()) {
    notes.push(`90-day outcome: ${planContext.initiativeOutcome90d}`);
  }
  if (domain === "business" && planContext.businessFocus?.trim()) {
    notes.push(`Building toward: ${planContext.businessFocus}`);
  }
  if (domain === "fitness") {
    if (planContext.currentWeight) notes.push(`Current weight: ${planContext.currentWeight}`);
    if (planContext.currentBodyFatPct) notes.push(`Body-fat: ${planContext.currentBodyFatPct}%`);
    if (planContext.trainingDaysPerWeek) {
      notes.push(`Training: ${planContext.trainingDaysPerWeek} days/week`);
    }
  }
  if (domain === "learning" && planContext.studyHoursPerDay) {
    notes.push(`Study: ${planContext.studyHoursPerDay} hrs/day`);
  }
  if (planContext.currentMetric?.trim()) {
    notes.push(`Baseline: ${planContext.currentMetric}`);
  }

  return notes;
}

async function buildInitiativeContextBlocks(
  supabase: SupabaseClient,
  userId: string,
  initiatives: Array<{
    id: string;
    title: string;
    description: string | null;
    life_area: string | null;
  }>,
  allocationIds: string[]
): Promise<string[]> {
  const blocks: string[] = [];
  const idSet = new Set(allocationIds);

  for (const init of initiatives.filter((i) => idSet.has(i.id))) {
    const planContext = await loadPlanContextData(supabase, userId, init.id);
    const notes = buildDomainScopedContextNotes(init, planContext);
    if (notes.length === 0) continue;
    const domain = detectDomain(`${init.title} ${init.description || ""}`, init.life_area);
    blocks.push(
      `${init.title} (${domain} — use ONLY for tasks linked to "${init.title}"):\n${notes.map((n) => `  - ${n}`).join("\n")}`
    );
  }

  return blocks;
}

function buildMilestoneLinesForAllocation(
  milestonesData: Array<{
    goal_id: string;
    title: string;
    status: string;
    goals: { title?: string } | { title?: string }[] | null;
  }>,
  allocationIds: string[]
): string[] {
  const lines: string[] = [];
  for (const initId of allocationIds) {
    const initMilestones = milestonesData.filter((m) => m.goal_id === initId);
    const current =
      initMilestones.find((m) => m.status === "in_progress") ||
      initMilestones.find((m) => m.status === "pending");
    if (!current) continue;
    const initRaw = current.goals;
    const initTitle = Array.isArray(initRaw)
      ? initRaw[0]?.title
      : initRaw?.title || "Goal";
    lines.push(`${initTitle}: [CURRENT] ${current.title}`);
  }
  return lines;
}

export { isVagueTask } from "@/lib/tasks/finishable-today";

function listOrFallback(items: string[], fallback: string): string {
  return items.length > 0 ? items.map((i) => `  - ${i}`).join("\n") : `  - ${fallback}`;
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function currentPlanPhase(): PlanPhase {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "night";
}

export async function fetchPlanUserContext(
  supabase: SupabaseClient,
  userId: string,
  options: FetchPlanOptions = {}
): Promise<PlanUserContext> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const since = sevenDaysAgo.toISOString();
  const today = new Date().toISOString().split("T")[0];

  const [
    pendingTasksRes,
    completedTasksRes,
    patternsRes,
    commitmentsRes,
    profileRes,
    signalsRes,
    onboardingRes,
    opportunitiesRes,
    balanceTasksRes,
    reflectionsRes,
    timeProfile,
    executionMetrics,
  ] = await Promise.all([
    supabase
      .from("tasks")
      .select("title, status, due_date, estimated_minutes")
      .eq("user_id", userId)
      .in("status", ["pending", "in_progress"])
      .order("due_date", { ascending: true })
      .limit(20),
    supabase
      .from("tasks")
      .select("title, completed_at")
      .eq("user_id", userId)
      .eq("status", "completed")
      .gte("completed_at", since)
      .order("completed_at", { ascending: false })
      .limit(12),
    supabase
      .from("execution_patterns")
      .select("pattern, behavioral_impact, severity, confidence, occurrences")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("occurrences", { ascending: false })
      .limit(6),
    supabase
      .from("commitments")
      .select("description, category, status, consistency_score")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(10),
    supabase
      .from("profiles")
      .select(
        "vision, daily_priorities, cognitive_state, work_style, lifestyle_issues, full_name, current_focus_goal_id, current_focus_until"
      )
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("identity_signals")
      .select("type, description, long_term_direction")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("onboarding_responses")
      .select("question_id, response_text, response_data")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("opportunities")
      .select("title, description, urgency, due_date, life_area")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(8),
    supabase
      .from("tasks")
      .select("status, completed_at, due_date, goals(life_area)")
      .eq("user_id", userId)
      .gte("due_date", new Date(Date.now() - 14 * 86400000).toISOString().split("T")[0])
      .limit(100),
    supabase
      .from("daily_reflections")
      .select("moved_forward, blocked_by, tomorrow_context, reflection_date")
      .eq("user_id", userId)
      .order("reflection_date", { ascending: false })
      .limit(3),
    fetchTimeEstimationProfile(supabase, userId),
    fetchExecutionMetrics(supabase, userId),
  ]);

  const executionGoals = await fetchActiveExecutionGoals(supabase, userId);
  const parentIds = executionGoals.map((g) => g.parent_goal_id).filter(Boolean) as string[];
  const parentMap = new Map<string, string>();
  if (parentIds.length > 0) {
    const { data: parents } = await supabase.from("goals").select("id, title").in("id", parentIds);
    for (const p of parents || []) parentMap.set(p.id, p.title);
  }
  const initiativesRaw = executionGoals.map((g) => ({
    ...g,
    parent_goal: g.parent_goal_id ? { title: parentMap.get(g.parent_goal_id) } : null,
  }));

  const initiativeIds = initiativesRaw.map((i) => i.id);
  const { data: milestonesData } =
    initiativeIds.length > 0
      ? await supabase
          .from("goal_milestones")
          .select("goal_id, title, status, sort_order, goals(title)")
          .eq("user_id", userId)
          .in("goal_id", initiativeIds)
          .order("sort_order", { ascending: true })
      : { data: [] as Array<{ goal_id: string; title: string; status: string; sort_order: number; goals: { title?: string } | null }> };

  const execCtx = await loadExecutionContext(supabase, userId);
  const userModel = await getUserModel(supabase, userId);
  const allocationIds = userModel.executionAllocation.map((a) => a.initiativeId);
  const primaryId =
    userModel.currentFocus.initiativeId ?? execCtx.primaryInitiative?.id ?? null;
  const initiatives = primaryId
    ? [
        ...initiativesRaw.filter((i) => i.id === primaryId),
        ...initiativesRaw.filter((i) => i.id !== primaryId),
      ]
    : initiativesRaw;
  const primaryInit = primaryId
    ? initiativesRaw.find((i) => i.id === primaryId)
    : initiativesRaw[0];
  const goals: Array<{ id: string; title: string; description?: string | null; target_date?: string | null; progress?: number | null; parent_goal_id?: string | null }> = [];
  const pendingTasks = pendingTasksRes.data || [];
  const completedTasks = completedTasksRes.data || [];
  const patterns = patternsRes.data || [];
  const commitments = commitmentsRes.data || [];
  const profile = profileRes.data;
  const signals = signalsRes.data || [];
  const onboarding = onboardingRes.data || [];
  const opportunities = opportunitiesRes.data || [];
  const balanceTasks = balanceTasksRes.data || [];
  const recentReflectionsData = reflectionsRes.data || [];

  const recentReflectionLines = recentReflectionsData.map(
    (r) =>
      `[${r.reflection_date}] Moved: ${r.moved_forward} | Blocked: ${r.blocked_by} | Tomorrow needs: ${r.tomorrow_context}`
  );

  const initiativeMap = new Map<string, string>();
  for (const i of initiatives) {
    initiativeMap.set(i.title.toLowerCase(), i.id);
  }

  const initiativeHealthLines = initiatives.map((i) => {
    const health = computeGoalHealth({
      status: i.status,
      targetDate: i.target_date,
      lastActionAt: i.last_action_at,
      progress: i.progress ?? 0,
    });
    return `${i.title} [${lifeAreaLabel(i.life_area || "personal")}] — ${health.label}: ${health.reason}`;
  });

  const initiativeLines = initiatives.map((i) => {
    const parentGoal = i.parent_goal as { title?: string } | { title?: string }[] | null;
    const goalTitle = Array.isArray(parentGoal) ? parentGoal[0]?.title : parentGoal?.title;
    const health = computeGoalHealth({
      status: i.status,
      targetDate: i.target_date,
      lastActionAt: i.last_action_at,
      progress: i.progress ?? 0,
    });
    const parts = [`[${lifeAreaLabel(i.life_area || "personal")}]`, i.title, `(${health.label})`];
    if (i.description) parts.push(i.description);
    const criteria = (i as { success_criteria?: string | null }).success_criteria;
    if (criteria) parts.push(`success criteria: ${criteria}`);
    if (goalTitle) parts.push(`supports goal: ${goalTitle}`);
    if (i.target_date) {
      const days = daysUntil(i.target_date);
      parts.push(
        days >= 0 ? `deadline ${i.target_date}, ${days}d left` : `overdue since ${i.target_date}`
      );
    }
    if (i.progress) parts.push(`${i.progress}% done`);
    return parts.join(" — ");
  });

  const opportunityLines = opportunities.map((o) => {
    const parts = [`[${o.urgency} urgency]`, o.title];
    if (o.description) parts.push(o.description);
    if (o.due_date) parts.push(`due ${o.due_date}`);
    if (o.life_area) parts.push(`(${lifeAreaLabel(o.life_area)})`);
    return parts.join(" — ");
  });

  const urgentOpportunityLines = opportunities
    .filter((o) => {
      if (o.urgency === "critical" || o.urgency === "high") return true;
      if (o.due_date) {
        const days = daysUntil(o.due_date);
        return days >= 0 && days <= 2;
      }
      return false;
    })
    .map((o) => {
      const due = o.due_date ? ` (due ${o.due_date})` : "";
      return `[URGENT — beats routine plans] ${o.title} — ${o.urgency} urgency${due}`;
    });

  const milestoneLines = buildMilestoneLinesForAllocation(
    milestonesData || [],
    allocationIds.length > 0 ? allocationIds : primaryInit ? [primaryInit.id] : []
  );

  let currentFocusTitle: string | null = primaryInit?.title ?? null;
  let currentFocusUntil: string | null =
    profileRes.data?.current_focus_until ?? primaryInit?.target_date ?? null;

  const patternGuidance = buildPatternGuidanceLines(patterns);
  const [lifeAreaWeights, weaknessProfiles, mentorMemories, memoryRetrieval] = await Promise.all([
    computeLifeAreaWeights(supabase, userId),
    loadWeaknessProfiles(supabase, userId),
    loadMentorMemories(supabase, userId, 8),
    loadMemoryRetrievalContext(supabase, userId),
  ]);
  const weaknessGuidance = formatWeaknessProfilesForPrompt(weaknessProfiles);
  const combinedPatternGuidance = [
    ...weaknessGuidance,
    ...patternGuidance,
    ...memoryRetrieval.activePlanningConstraints,
  ];
  const lifeAreaWeightPlan = formatLifeAreaPlanStructure(lifeAreaWeights);
  const mentorMemoryBlock = formatMentorMemoriesForPrompt(mentorMemories);
  const memoryPlanningConstraints = memoryRetrieval.activePlanningConstraints;

  const balanceRows = balanceTasks.map((t) => ({
    life_area: (t.goals as { life_area?: string } | null)?.life_area || "personal",
    status: t.status,
    completed_at: t.completed_at,
    due_date: t.due_date,
  }));
  const lifeAreaBalance = computeLifeAreaBalance(balanceRows);
  const lifeAreaBalanceLines = lifeAreaBalance
    .filter((b) => b.plannedTasks > 0 || b.completedTasks > 0)
    .map(
      (b) =>
        `${b.label}: ${b.attentionPct}% attention, ${b.completedTasks}/${b.plannedTasks} completed${
          b.daysSinceAction !== null ? `, last action ${b.daysSinceAction}d ago` : ", no recent action"
        }`
    );
  const lifeAreaInsight = formatBalanceInsight(lifeAreaBalance);

  const upcomingDeadlines: string[] = [];
  for (const i of initiatives) {
    if (i.target_date && i.target_date >= today) {
      upcomingDeadlines.push(`${i.title} due ${i.target_date}`);
    }
  }

  const goalLines: string[] = [];

  const commitmentLines = commitments.map(
    (c) =>
      `${c.description}${c.category ? ` (${c.category})` : ""}${
        c.consistency_score != null ? ` — follow-through ${c.consistency_score}%` : ""
      }`
  );

  const unfinishedLines = pendingTasks.map((t) => {
    const due = t.due_date ? `, due ${t.due_date}` : "";
    return `${t.title}${due}`;
  });

  const recentProgressLines = completedTasks.map((t) => {
    const when = t.completed_at
      ? new Date(t.completed_at).toLocaleDateString()
      : "recently";
    return `Completed "${t.title}" on ${when}`;
  });

  const obstacleLines = patterns.map(
    (p) => `${p.pattern} (${p.severity}): ${p.behavioral_impact || "slows execution"}`
  );

  const cognitive = profile?.cognitive_state as Record<string, unknown> | null;
  const priorities = Array.isArray(profile?.daily_priorities)
    ? (profile.daily_priorities as string[])
    : [];

  const identityParts: string[] = [];
  if (signals.length > 0) {
    identityParts.push(
      ...signals.map((s) =>
        s.long_term_direction
          ? `${s.description} → ${s.long_term_direction}`
          : s.description
      )
    );
  }
  if (profile?.work_style) identityParts.push(`Work style: ${profile.work_style}`);

  const lifeParts: string[] = [];
  if (profile?.lifestyle_issues) lifeParts.push(String(profile.lifestyle_issues));
  if (onboarding.length > 0) {
    lifeParts.push(
      ...onboarding
        .filter((r) => r.response_text)
        .slice(0, 4)
        .map((r) => r.response_text as string)
    );
  }
  if (cognitive?.dominant_patterns && Array.isArray(cognitive.dominant_patterns)) {
    lifeParts.push(`Patterns: ${(cognitive.dominant_patterns as string[]).join(", ")}`);
  }
  if (cognitive?.momentum) lifeParts.push(`Momentum: ${cognitive.momentum}`);
  if (cognitive?.energy_state) lifeParts.push(`Energy: ${cognitive.energy_state}`);

  let energyLevel = "moderate — standard capacity";
  if (cognitive?.energy_state) {
    energyLevel = String(cognitive.energy_state);
  } else if (cognitive?.momentum === "fragile but improving") {
    energyLevel = "low-moderate — keep tasks shorter and focused";
  }

  const confidence = computePlanConfidence({
    initiatives: initiatives.map((i) => ({
      title: i.title,
      targetDate: i.target_date,
    })),
    commitments: commitmentLines,
    goals: goalLines,
    unfinishedTasks: unfinishedLines,
    recentProgress: recentProgressLines,
    obstacles: obstacleLines,
    upcomingDeadlines,
    opportunities: opportunityLines.length,
  });

  const planContext = primaryInit
    ? await loadPlanContextData(supabase, userId, primaryInit.id)
    : await loadPlanContextData(supabase, userId, "_none");
  const linkedGoal = null; // direction goals excluded from daily planner
  const dimensionInput = {
    goals: [],
    initiatives: initiatives.map((i) => ({
      title: i.title,
      description: i.description,
      target_date: i.target_date,
      life_area: i.life_area,
    })),
    patterns: patterns.map((p) => ({
      pattern: p.pattern,
      behavioral_impact: p.behavioral_impact,
    })),
    recentCompletedTasks: completedTasks.length,
    recentReflections: recentReflectionsData.map((r) => ({ blocked_by: r.blocked_by })),
    planContext,
    questionsAskedToday: planContext.interviewAskedToday || [],
  };
  const contextSnapshot = buildPlanContextSnapshot(dimensionInput);
  const goalAnalysis =
    primaryInit
      ? buildGoalAnalysis({
          domain: detectDomain(`${primaryInit.title} ${primaryInit.description || ""}`, primaryInit.life_area),
          initiativeTitle: primaryInit.title,
          initiativeDescription: primaryInit.description ?? undefined,
          targetDate: primaryInit.target_date ?? undefined,
          lifeArea: primaryInit.life_area ?? undefined,
          goalTexts: [],
          planContext: planContext as Record<string, unknown>,
        })
      : null;

  const effectiveScore = contextSnapshot.overall;
  confidence.score = effectiveScore;
  confidence.gaps = improvementHints(dimensionInput);

  const planContextNotes: string[] = [];
  const initiativeContextBlocks = await buildInitiativeContextBlocks(
    supabase,
    userId,
    initiativesRaw.map((i) => ({
      id: i.id,
      title: i.title,
      description: i.description,
      life_area: i.life_area,
    })),
    allocationIds.length > 0 ? allocationIds : primaryInit ? [primaryInit.id] : []
  );

  if (primaryInit && initiativeContextBlocks.length === 0) {
    const fallbackContext = await loadPlanContextData(supabase, userId, primaryInit.id);
    planContextNotes.push(...buildDomainScopedContextNotes(primaryInit, fallbackContext));
  }

  const planMode: PlanMode =
    effectiveScore < 55 && initiatives.length === 0 ? "context_building" : "normal";
  const planPhase = options.planPhase ?? currentPlanPhase();
  const middayCompleted = options.middayCompleted ?? [];
  const activeGoalCount = Math.max(1, initiatives.length);
  const maxTasks =
    initiatives.length > 0 ? activeGoalCount * TASKS_PER_GOAL : planMode === "context_building" ? 2 : 0;

  const baseMinutes = 480;
  const availableMinutes = baseMinutes;

  let availableMinutesAdjusted = availableMinutes;
  if (planPhase === "afternoon" && middayCompleted.length > 0) {
    availableMinutesAdjusted = Math.max(90, Math.round(availableMinutes * 0.55));
  }

  const executionAllocationLines =
    userModel.executionAllocation.length > 0
      ? formatExecutionAllocationForPrompt(
          userModel.executionAllocation,
          availableMinutesAdjusted
        )
      : primaryInit
        ? [`[FOCUS — 100%] ${primaryInit.title}: current focus only`]
        : [];

  return {
    initiatives: initiativeLines,
    initiativeHealth: initiativeHealthLines,
    initiativeMilestones: milestoneLines,
    upcomingDeadlines,
    opportunities: opportunityLines,
    urgentOpportunities: urgentOpportunityLines,
    recentReflections: recentReflectionLines,
    lifeAreaBalance: lifeAreaBalanceLines,
    goals: goalLines,
    commitments: commitmentLines,
    vision: profile?.vision || "Not set",
    currentPriorities:
      priorities.length > 0
        ? priorities
        : cognitive?.active_focus
          ? [String(cognitive.active_focus)]
          : [],
    currentFocus: currentFocusTitle,
    currentFocusUntil,
    unfinishedTasks: unfinishedLines,
    recentProgress: recentProgressLines,
    obstacles: obstacleLines,
    patternGuidance: combinedPatternGuidance,
    planContextNotes,
    availableMinutes: availableMinutesAdjusted,
    energyLevel,
    identityContext:
      identityParts.length > 0 ? identityParts.join("; ") : "Limited identity data",
    lifeContext:
      lifeParts.length > 0 ? lifeParts.join("; ") : "Limited life context on file",
    confidence,
    planMode,
    contextSnapshot,
    goalAnalysis,
    primaryInitiativeTitle: primaryInit?.title ?? null,
    maxTasks: planPhase === "afternoon" && middayCompleted.length > 0 ? Math.min(maxTasks, 3) : maxTasks,
    timeEstimationRatio: timeProfile.estimationRatio,
    executionRate7d: executionMetrics.last7Days.rate,
    initiativeMap,
    activeGoalTitles: initiatives.map((i) => i.title),
    lifeAreaInsight: lifeAreaInsight ?? undefined,
    timeEstimationInsight: timeProfile.insight ?? undefined,
    planPhase,
    middayCompleted,
    userModelNarrative: userModel.narrative,
    executionAllocationLines,
    initiativeContextBlocks,
    lifeAreaWeightPlan,
    mentorMemoryBlock,
    memoryPlanningConstraints,
  };
}

function planningContextFromSnapshot(
  snapshot: PlanContextSnapshot,
  goalAnalysis: GoalAnalysis | null
): PlanningContextSummary {
  return {
    planningQuality: snapshot.planningQuality,
    dimensions: snapshot.dimensions.map((d) => ({
      id: d.id,
      label: d.label,
      satisfied: d.satisfied,
      gapHint: d.gapHint,
    })),
    improvementHints:
      goalAnalysis?.missingVariables.slice(0, 3).map((m) => m.why) ?? [],
    coachInsight: goalAnalysis?.coachInsight,
    missingLabels: goalAnalysis?.missingVariables.map((m) => m.label),
    daysRemaining: goalAnalysis?.daysRemaining,
  };
}

function buildPrompt(ctx: PlanUserContext): string {
  const availableHours = Math.round(ctx.availableMinutes / 60);

  const modeInstructions =
    ctx.planMode === "context_building" && ctx.initiatives.length === 0
      ? `CONTEXT-BUILDING MODE (no active goals yet):
- Generate ONLY 1–2 context-building tasks
- Ask for missing execution info in whyTheseTasks
- Mark ALL tasks isContextBuilding: true`
      : `EXECUTION MODE — STRICT 3-TASK RULE:
- Generate EXACTLY ${TASKS_PER_GOAL} tasks per active goal (${ctx.initiatives.length} goals → ${ctx.maxTasks} tasks total)
- NO bonus tasks, NO optional stretches, NO 4th or 5th tasks
- Each task needs whyItMatters tying it to the goal's CURRENT milestone and recent activity
- Tasks must link via linkedInitiative (exact goal title) and linkedMilestone
- Tell the user what fits today and what does NOT if they cannot finish something`;

  return `You are an elite execution coach and execution planner — not a goal tracker.

USER MODEL (authoritative — one person, multiple pursuits):
${ctx.userModelNarrative}

EXECUTION ALLOCATION (distribute tasks and time proportionally — intelligently mixed day):
${listOrFallback(ctx.executionAllocationLines, "Single focus — allocate 100% to current focus initiative")}

PRIORITY STACK (strict):
1. URGENT OPPORTUNITIES — time-sensitive events override routine
2. LIFE AREA BALANCE — distribute tasks across user's life areas (see weights below)
3. CURRENT FOCUS initiative — largest share but NOT 100% when multiple areas matter
4. SECONDARY portfolio — max 1–2 tasks total, only if explicitly allocated >= 20%
5. NEVER generate tasks from long-term goals/direction alone (e.g. "track income" when focus is MenAI)

${ctx.lifeAreaWeightPlan}

MENTOR MEMORY (thoughts, beliefs, self-talk — use to personalize whyItMatters):
${ctx.mentorMemoryBlock}

CURRENT FOCUS (gets largest share — not the only share):
${ctx.currentFocus ? `  - ${ctx.currentFocus}${ctx.currentFocusUntil ? ` until ${ctx.currentFocusUntil}` : ""}` : "  - Not set — spread across active portfolio"}

CONTEXT ISOLATION RULE — critical:
- Each initiative has its own interview context below. NEVER apply fitness metrics to business tasks or vice versa.
- Tasks must use ONLY the context block matching their linkedInitiative.

Plan phase: ${ctx.planPhase}${ctx.middayCompleted.length > 0 ? `\nAlready completed this morning:\n${ctx.middayCompleted.map((t) => `  - ${t}`).join("\n")}\nGenerate ONLY remaining afternoon tasks — preserve allocation ratios.` : ""}

URGENT OPPORTUNITIES (override allocation — rearrange day around these):
${listOrFallback(ctx.urgentOpportunities, "None — proceed with allocated initiative blocks")}

Initiative milestones (one CURRENT milestone per initiative — tasks advance that milestone):
${listOrFallback(ctx.initiativeMilestones, "No milestones yet — include one context-building task per initiative missing milestones")}

Every non-context-building task MUST include linkedInitiative AND linkedMilestone matching its initiative's CURRENT milestone.
Task estimatedMinutes should roughly fit the allocation percentages above.

PRIMARY INPUT — Active initiatives (full portfolio):
${listOrFallback(ctx.initiatives, "NONE — context is thin; prefer context-building tasks")}

Initiative health (narrative — use these labels in whyItMatters, not percentages):
${listOrFallback(ctx.initiativeHealth, "No initiatives")}

All opportunities:
${listOrFallback(ctx.opportunities, "None logged — consider asking if anything time-sensitive this week")}

Execution patterns → task design (MUST follow — counter weaknesses with action, not more research):
${listOrFallback(ctx.patternGuidance, "No patterns detected yet")}
- If overthinking is listed: NEVER assign "research competitors" — assign "talk to 1 user" or "send 1 outreach"
${ctx.memoryPlanningConstraints.length > 0 ? `\nMEMORY-DRIVEN PLAN CONSTRAINTS (mandatory — from reflections and patterns):\n${ctx.memoryPlanningConstraints.map((c) => `- ${c}`).join("\n")}\n- Fragmented/reactive days: 1 critical outcome + 2 interruptible tasks max` : ""}

Daily reflections (use for context — explains low execution):
${listOrFallback(ctx.recentReflections, "None logged yet")}

Life area balance (last 14 days):
${listOrFallback(ctx.lifeAreaBalance, "No activity data yet")}
${ctx.lifeAreaInsight ? `\nBalance insight: ${ctx.lifeAreaInsight}` : ""}

Upcoming deadlines:
${listOrFallback(ctx.upcomingDeadlines, "None")}

TASK FORMAT (mandatory for every task):
- title: specific action verb + deliverable (NOT "work on X")
- whyItMatters: one sentence — why this moves the CURRENT FOCUS initiative today
- successMetric: concrete done criteria — verifiable yes/no today (e.g. "Complete signup → onboarding → dashboard without errors")
- deliverable: what exists when finished

BAD: "Track expenses", "Work on onboarding", "Improve fitness"
GOOD: "Complete onboarding testing" / Why: "Removes biggest blocker before launch" / Success: "Signup through dashboard works without errors"
DOMAIN RULE — match task language to initiative life areas:
- health → nutrition, training, walks — NEVER SaaS/customer/outreach tasks
- learning → study blocks, syllabus, mocks — NEVER startup/MVP/customer tasks
- career → applications, prep, networking for jobs — not product launch tasks
- business → only area where outreach/MVP/customer tasks are appropriate
BAD: "Build scalable businesses", "Increase income", "Improve fitness", "Research competitors" (when overthinking pattern detected)
GOOD: "Send 5 outreach emails" (business only), "Walk 30 minutes" (health), "Complete 2 UPSC chapters" (learning)
Each task needs a deliverable + successMetric that is yes/no verifiable today.

Commitments:
${listOrFallback(ctx.commitments, "None")}

Interview context (per-initiative — NEVER cross-contaminate domains):
${ctx.initiativeContextBlocks.length > 0 ? ctx.initiativeContextBlocks.join("\n\n") : listOrFallback(ctx.planContextNotes, "None yet — gaps remain in obstacle/time clarity")}

Vision: ${ctx.vision}

Unfinished tasks:
${listOrFallback(ctx.unfinishedTasks, "None")}

Recent progress (last 7 days):
${listOrFallback(ctx.recentProgress, "No completed tasks logged recently")}

Obstacles:
${listOrFallback(ctx.obstacles, "None detected")}

Execution rate (7-day planned tasks): ${ctx.executionRate7d}%
${ctx.timeEstimationInsight ? `Time estimation: ${ctx.timeEstimationInsight}` : ""}

Available time: ${availableHours} hours (${ctx.availableMinutes} minutes)
Energy: ${ctx.energyLevel}

Context gaps (use for context-building tasks only): ${ctx.confidence.gaps.join("; ") || "None"}

${ctx.goalAnalysis ? `GOAL ANALYSIS (use this for whatMattersNow — do NOT repeat verbatim):
${ctx.goalAnalysis.coachInsight}
Days remaining: ${ctx.goalAnalysis.daysRemaining ?? "unknown"}
Missing variables: ${ctx.goalAnalysis.missingVariables.map((m) => m.label).join(", ") || "none"}
Once known, MenAI can estimate: ${ctx.goalAnalysis.onceKnown.join(", ")}` : ""}

${COACH_WRITING_RULES}

${modeInstructions}

LANGUAGE RULES:
- whatMattersNow = "This is why today matters" — one human sentence about stakes and momentum, NOT a task title or initiative name alone.
- daySummary = companion framing ("Today is about...") — NOT "Here are your tasks".
- whyTheseTasks = 2-4 sentences explaining what actually moves them forward and WHY now — mentor voice, not checklist rationale.
- Tasks are secondary to meaning. Users finish plans when they understand why, not when they get a longer list.
- If missing variables exist, whatMattersNow should name the biggest gap honestly.
- Include "evidenceUsed" array listing each specific data point you relied on.
- Do NOT use hedging phrases. Say what's missing or what to do today.

CRITICAL: Lead with meaning, then actions. Max ${ctx.maxTasks} tasks — each must earn its place.
Urgent opportunities ALWAYS beat routine allocation.
Each task advances its initiative's CURRENT milestone using ONLY that initiative's context.
whyTheseTasks MUST explain the allocation mix and why each initiative got its share today.

${TASK_QUALITY_PROMPT}

Return JSON only:
{
  "whatMattersNow": "Why today matters — one human sentence about stakes/momentum (not a task title)",
  "topObstacle": "One sentence — pattern or blocker to watch",
  "daySummary": "Companion framing: what kind of day this is and why it matters",
  "whyTheseTasks": "2-4 sentences — what actually moves them forward and why NOW",
  "evidenceUsed": ["data point 1", "data point 2"],
  "assumptions": ["only in normal mode if needed"],
  "tasks": [{
    "title": "Concrete action",
    "whyItMatters": "Why this task? — cite pattern, delay, milestone, or opportunity",
    "estimatedMinutes": 60,
    "deliverable": "Exact output",
    "successMetric": "Measurable done criteria",
    "isContextBuilding": false,
    "lifeArea": "career|business|finance|health|learning|relationships|personal",
    "linkedInitiative": "initiative title",
    "linkedMilestone": "exact current in_progress milestone title — required for non-context-building tasks"
  }]
}`;
}

function enforceThreeTasksPerGoal(
  tasks: DailyPlanTask[],
  goalTitles: string[],
  maxTasks: number
): DailyPlanTask[] {
  if (goalTitles.length === 0) return tasks.slice(0, maxTasks);

  const byGoal = new Map<string, DailyPlanTask[]>();
  const unlinked: DailyPlanTask[] = [];

  for (const t of tasks) {
    const key = t.linkedInitiative?.trim().toLowerCase() || "";
    const matched = goalTitles.find((g) => g.toLowerCase() === key);
    if (matched) {
      const list = byGoal.get(matched.toLowerCase()) || [];
      list.push(t);
      byGoal.set(matched.toLowerCase(), list);
    } else {
      unlinked.push(t);
    }
  }

  const result: DailyPlanTask[] = [];
  for (const title of goalTitles) {
    const key = title.toLowerCase();
    let list = byGoal.get(key) || [];
    while (list.length < TASKS_PER_GOAL && unlinked.length > 0) {
      const next = unlinked.shift()!;
      list.push({ ...next, linkedInitiative: title });
    }
    result.push(...list.slice(0, TASKS_PER_GOAL));
  }

  return result.slice(0, maxTasks);
}

function fitTasksToTimeBudget(
  tasks: DailyPlanTask[],
  maxMinutes: number,
  maxTasks: number
): DailyPlanTask[] {
  let total = 0;
  const fitted: DailyPlanTask[] = [];

  for (const task of tasks) {
    if (fitted.length >= maxTasks) break;
    if (total + task.estimatedMinutes > maxMinutes) continue;
    fitted.push(task);
    total += task.estimatedMinutes;
  }

  return fitted.length > 0 ? fitted : tasks.slice(0, Math.min(maxTasks, 3));
}

export async function generateDailyPlanWithAI(
  ctx: PlanUserContext,
  userId?: string
): Promise<DailyPlanContent> {
  const openai = getOpenAI();

  const completion = await openai.chat.completions.create({
    model: FAST_MODEL,
    temperature: 0.35,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are an execution planner. Never invent vague or generic tasks. Every task must be one concrete action finishable today tied to a milestone. Reject research/planning tasks when overthinking is detected. JSON only.",
      },
      { role: "user", content: buildPrompt(ctx) },
    ],
  });

  if (userId) {
    logAiUsage(
      userId,
      "daily_plan",
      FAST_MODEL,
      completion.usage?.prompt_tokens ?? 0,
      completion.usage?.completion_tokens ?? 0
    ).catch(() => {});
  }

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty AI response");

  const parsed = JSON.parse(raw) as {
    whatMattersNow?: string;
    topObstacle?: string;
    daySummary?: string;
    whyTheseTasks?: string;
    assumptions?: string[];
    evidenceUsed?: string[];
    tasks?: Array<
      DailyPlanTask & { isContextBuilding?: boolean; linkedInitiative?: string }
    >;
  };

  const timeMode = ctx.planMode === "context_building" ? "conservative" : "normal";

  let tasks: DailyPlanTask[] = (parsed.tasks || [])
    .filter((t) => t.title && (t.isContextBuilding || passesTaskQualityGate(t.title)))
    .map((t) => ({
      title: t.title.trim(),
      whyItMatters:
        t.whyItMatters?.trim() ||
        "This is the highest-leverage move available today.",
      estimatedMinutes: adjustMinutesForUser(
        Math.min(180, Math.max(30, Number(t.estimatedMinutes) || 60)),
        ctx.timeEstimationRatio,
        timeMode
      ),
      deliverable: t.deliverable?.trim() || "Completed output ready to review",
      successMetric:
        t.successMetric?.trim() || "Done and verifiable with a clear yes/no",
      isContextBuilding: ctx.planMode === "context_building" || !!t.isContextBuilding,
      lifeArea: t.lifeArea,
      linkedInitiative: t.linkedInitiative?.trim(),
      linkedMilestone: t.linkedMilestone?.trim(),
    }));

  if (ctx.planMode === "context_building" && ctx.initiatives.length === 0) {
    tasks = tasks.filter((t) => t.isContextBuilding).slice(0, 2);
    if (tasks.length === 0 && (parsed.tasks || []).length > 0) {
      tasks = (parsed.tasks || []).slice(0, 2).map((t) => ({
        title: t.title.trim(),
        whyItMatters: t.whyItMatters?.trim() || "Build context before doing busy work.",
        estimatedMinutes: 45,
        deliverable: t.deliverable?.trim() || "Written output",
        successMetric: t.successMetric?.trim() || "Clear yes/no",
        isContextBuilding: true,
        lifeArea: t.lifeArea,
        linkedInitiative: t.linkedInitiative,
      }));
    }
  }

  tasks = enforceThreeTasksPerGoal(tasks, ctx.activeGoalTitles, ctx.maxTasks);
  tasks = fitTasksToTimeBudget(tasks, ctx.availableMinutes, ctx.maxTasks);
  tasks = enforceThreeTasksPerGoal(tasks, ctx.activeGoalTitles, ctx.maxTasks);

  if (tasks.length === 0) {
    throw new Error("AI produced only vague or oversized tasks");
  }

  const score = ctx.confidence.score;
  const evidence =
    (parsed.evidenceUsed?.filter(Boolean).length ?? 0) > 0
      ? parsed.evidenceUsed!.filter(Boolean).slice(0, 6)
      : buildPlanEvidence(ctx);

  const coachCtx = {
    userGoal: ctx.primaryInitiativeTitle || undefined,
    missingVariables: ctx.goalAnalysis?.missingVariables.map((m) => m.label),
  };

  const fallbackWhatMatters =
    ctx.goalAnalysis?.coachInsight ||
    (ctx.planMode === "context_building"
      ? `MenAI still needs ${ctx.goalAnalysis?.missingVariables[0]?.label.toLowerCase() || "more context"} before tasks can be precise.`
      : undefined);

  return {
    whatMattersNow:
      sanitizeCoachText(parsed.whatMattersNow?.trim(), coachCtx) ||
      fallbackWhatMatters,
    topObstacle: sanitizeCoachText(parsed.topObstacle?.trim(), coachCtx),
    whyTheseTasks:
      sanitizeCoachText(
        parsed.whyTheseTasks?.trim() ||
          (ctx.planMode === "context_building"
            ? ctx.goalAnalysis?.coachInsight
            : "These tasks advance your current milestone — each ties to a specific deliverable today."),
        coachCtx
      ) || "",
    daySummary:
      sanitizeCoachText(
        parsed.daySummary?.trim(),
        coachCtx
      ) || ctx.goalAnalysis?.coachInsight || "",
    confidence: ctx.confidence,
    planMode: ctx.planMode,
    planningContext: planningContextFromSnapshot(ctx.contextSnapshot, ctx.goalAnalysis),
    assumptions: parsed.assumptions?.filter(Boolean).slice(0, 3),
    lifeAreaInsight: ctx.lifeAreaInsight,
    timeEstimationInsight: ctx.timeEstimationInsight ?? undefined,
    executionRate7d: ctx.executionRate7d,
    evidence,
    tasks,
  };
}

export async function invalidateTodayPlan(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const today = new Date().toISOString().split("T")[0];
  await supabase
    .from("daily_plans")
    .delete()
    .eq("user_id", userId)
    .eq("plan_date", today);
}

export function buildEmptyPlan(): DailyPlanContent {
  return {
    daySummary: "Add an active goal with a deadline to generate today's tasks.",
    whatMattersNow: undefined,
    whyTheseTasks: "",
    confidence: {
      score: 15,
      gaps: ["No active goals"],
      strengths: [],
    },
    planMode: "context_building",
    tasks: [],
    evidence: ["No active goals"],
  };
}

export async function ensureTodayPlan(
  supabase: SupabaseClient,
  userId: string
): Promise<{ plan: DailyPlanContent; planId: string; created: boolean }> {
  const today = new Date().toISOString().split("T")[0];

  const goalCount = await countActiveExecutionGoals(supabase, userId);

  if (goalCount === 0) {
    await invalidateTodayPlan(supabase, userId);
    const empty = buildEmptyPlan();
    const { data: inserted, error } = await supabase
      .from("daily_plans")
      .insert({
        user_id: userId,
        plan_date: today,
        plan_content: empty,
        ai_notes: empty.daySummary,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { plan: empty, planId: inserted.id, created: false };
  }

  const { data: existing } = await supabase
    .from("daily_plans")
    .select("id, plan_content")
    .eq("user_id", userId)
    .eq("plan_date", today)
    .maybeSingle();

  if (existing?.plan_content) {
    const content = normalizePlanContent(existing.plan_content);
    const expectedTasks = goalCount * TASKS_PER_GOAL;
    const stale =
      content.tasks.some((t) => isVagueTask(t.title)) ||
      content.tasks.some((t) => !t.deliverable || !t.successMetric) ||
      !content.whyTheseTasks ||
      !content.confidence ||
      !content.planMode ||
      !content.planningContext ||
      (expectedTasks > 0 && content.tasks.length !== expectedTasks);

    if (!stale && content.tasks.length > 0) {
      return { plan: content, planId: existing.id, created: false };
    }

    await supabase.from("daily_plans").delete().eq("id", existing.id);
  }

  const ctx = await fetchPlanUserContext(supabase, userId);

  const quota = await checkAiQuota(userId, "daily_plan");
  if (!quota.allowed) {
    throw new Error(AI_UNAVAILABLE_MESSAGE);
  }

  const planContent = await generateDailyPlanWithAI(ctx, userId);

  const { data: inserted, error } = await supabase
    .from("daily_plans")
    .insert({
      user_id: userId,
      plan_date: today,
      plan_content: planContent,
      ai_notes: planContent.daySummary,
    })
    .select("id")
    .single();

  if (error) throw error;

  await recordPlanGeneration(supabase, userId, today);
  trackProductEventOnce(userId, "first_plan_generated").catch(() => {});
  scheduleUserModelRefresh(supabase, userId);

  const { data: existingTodayTasks } = await supabase
    .from("tasks")
    .select("title")
    .eq("user_id", userId)
    .eq("due_date", today);

  const existingTitles = new Set(
    (existingTodayTasks || []).map((t) => t.title.toLowerCase())
  );

  const newTasks = planContent.tasks
    .filter((t) => !existingTitles.has(t.title.toLowerCase()))
    .map((t) => {
      const initiativeId = t.linkedInitiative
        ? ctx.initiativeMap.get(t.linkedInitiative.toLowerCase())
        : undefined;
      return {
        user_id: userId,
        title: t.title,
        description: `${t.whyItMatters}\n\nDeliverable: ${t.deliverable}\nSuccess: ${t.successMetric}`,
        status: "pending",
        due_date: today,
        estimated_minutes: t.estimatedMinutes,
        goal_id: initiativeId || null,
        auto_generated: true,
        generation_reason: t.isContextBuilding ? "context_building" : "daily_plan",
      };
    });

  if (newTasks.length > 0) {
    await supabase.from("tasks").insert(newTasks);
  }

  return { plan: planContent, planId: inserted.id, created: true };
}

/** Midday replan: keep morning wins, regenerate afternoon tasks. */
export async function adjustMiddayPlan(
  supabase: SupabaseClient,
  userId: string,
  completedTitles: string[]
): Promise<{ plan: DailyPlanContent; planId: string }> {
  const today = new Date().toISOString().split("T")[0];

  const { data: existing } = await supabase
    .from("daily_plans")
    .select("id, plan_content")
    .eq("user_id", userId)
    .eq("plan_date", today)
    .maybeSingle();

  const prior = existing?.plan_content
    ? normalizePlanContent(existing.plan_content)
    : null;

  const ctx = await fetchPlanUserContext(supabase, userId, {
    middayCompleted: completedTitles,
    planPhase: "afternoon",
  });

  const quota = await checkAiQuota(userId, "daily_plan");
  if (!quota.allowed) throw new Error(AI_UNAVAILABLE_MESSAGE);

  const afternoonPlan = await generateDailyPlanWithAI(ctx, userId);

  const completedSet = new Set(completedTitles.map((t) => t.toLowerCase()));
  const morningTasks = (prior?.tasks || []).filter((t) =>
    completedSet.has(t.title.toLowerCase())
  );
  const mergedTasks = [...morningTasks, ...afternoonPlan.tasks];

  const planContent: DailyPlanContent = {
    ...afternoonPlan,
    daySummary: `Morning: ${completedTitles.length} done. Afternoon: ${afternoonPlan.daySummary}`,
    whyTheseTasks: `You completed ${completedTitles.length} task(s) this morning. ${afternoonPlan.whyTheseTasks}`,
    tasks: mergedTasks,
  };

  let planId = existing?.id;
  if (planId) {
    await supabase
      .from("daily_plans")
      .update({ plan_content: planContent, ai_notes: planContent.daySummary })
      .eq("id", planId);
  } else {
    const { data: inserted, error } = await supabase
      .from("daily_plans")
      .insert({
        user_id: userId,
        plan_date: today,
        plan_content: planContent,
        ai_notes: planContent.daySummary,
      })
      .select("id")
      .single();
    if (error) throw error;
    planId = inserted.id;
  }

  const { data: existingTodayTasks } = await supabase
    .from("tasks")
    .select("title")
    .eq("user_id", userId)
    .eq("due_date", today);

  const existingTitles = new Set(
    (existingTodayTasks || []).map((t) => t.title.toLowerCase())
  );

  const newTasks = afternoonPlan.tasks
    .filter((t) => !existingTitles.has(t.title.toLowerCase()))
    .map((t) => {
      const initiativeId = t.linkedInitiative
        ? ctx.initiativeMap.get(t.linkedInitiative.toLowerCase())
        : undefined;
      return {
        user_id: userId,
        title: t.title,
        description: `${t.whyItMatters}\n\nDeliverable: ${t.deliverable}\nSuccess: ${t.successMetric}`,
        status: "pending",
        due_date: today,
        estimated_minutes: t.estimatedMinutes,
        goal_id: initiativeId || null,
        auto_generated: true,
        generation_reason: "midday_adjust",
      };
    });

  if (newTasks.length > 0) {
    await supabase.from("tasks").insert(newTasks);
  }

  return { plan: planContent, planId: planId! };
}

function normalizePlanContent(raw: unknown): DailyPlanContent {
  const content = raw as Record<string, unknown>;

  const tasks = ((content.tasks as DailyPlanTask[]) || []).map((t) => {
    const legacy = t as DailyPlanTask & { reason?: string };
    return {
      title: legacy.title,
      whyItMatters: legacy.whyItMatters || legacy.reason || "",
      estimatedMinutes: legacy.estimatedMinutes || 60,
      deliverable: legacy.deliverable || "",
      successMetric: legacy.successMetric || "",
      isContextBuilding: legacy.isContextBuilding ?? false,
    };
  });

  return {
    whatMattersNow: content.whatMattersNow as string | undefined,
    topObstacle: content.topObstacle as string | undefined,
    whyTheseTasks: String(content.whyTheseTasks || ""),
    daySummary: String(content.daySummary || content.aiNotes || ""),
    confidence: (content.confidence as PlanConfidence) || {
      score: 0,
      gaps: ["Plan generated before confidence scoring"],
      strengths: [],
    },
    planMode: (content.planMode as PlanMode) || "normal",
    planningContext: content.planningContext as PlanningContextSummary | undefined,
    assumptions: content.assumptions as string[] | undefined,
    lifeAreaInsight: content.lifeAreaInsight as string | undefined,
    timeEstimationInsight: content.timeEstimationInsight as string | undefined,
    executionRate7d: content.executionRate7d as number | undefined,
    evidence: (content.evidence as string[]) || [],
    tasks,
  };
}
