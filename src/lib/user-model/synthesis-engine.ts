import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildGoalAnalysis,
  detectDomain,
  type GoalAnalysis,
} from "@/lib/plans/coach-insights";
import { loadPlanContextData } from "@/lib/plans/plan-interview";
import { loadExecutionContext } from "@/lib/user-model/resolve-context";
import { computeGoalConfidence } from "@/lib/plans/goal-confidence";
import type { UserModel, UserModelConfidence } from "@/lib/user-model/types";
import { USER_MODEL_VERSION } from "@/lib/user-model/types";
import {
  buildPrimaryHeadline,
  buildUserModelNarrative,
  emptyUserModel,
} from "@/lib/user-model/narrative";
import { computeExecutionAllocation } from "@/lib/user-model/execution-allocation";
import { buildEvidenceBundle } from "@/lib/user-model/evidence-bundle";
import {
  averageCoverage,
  emptyIdentityCoverage,
} from "@/lib/user-model/identity-dimensions";
import {
  buildEvidenceBasedWhoAmI,
  computeBaselineCoverage,
} from "@/lib/user-model/identity-synthesis";
import {
  formatMemoryGraphSummary,
  loadMemoryRetrievalContext,
} from "@/lib/mentor/memory-retrieval";
import { dedupeSemanticThemes } from "@/lib/user-model/theme-dedup";
import { formatKnowledgeBulletsForRail, trimKnowledgeBullet } from "@/lib/plans/task-why-line";
import type { EvidenceBundle } from "@/lib/user-model/evidence-bundle";
import { sanitizeCoachCopy } from "@/lib/user-model/content-guard";
import { loadIdentityProfile } from "@/lib/plans/identity-profile-store";
import { invalidateUserCache } from "@/lib/ai/orchestrator/cache-invalidation";

function buildSynthesisKnowledgeBullets(
  bundle: EvidenceBundle,
  understands: string[]
): string[] {
  const ACHIEVEMENT = /\b(secured|landed|closed|completed|achieved|client|milestone)\b/i;
  const PATTERN_LABELS: Record<string, string> = {
    overthinking: "Tends to overthink before starting",
    procrastination: "Delays when tasks feel large",
    burnout: "Energy drops under sustained load",
    scattered_focus: "Spreads focus across priorities",
    inconsistency: "Momentum resets frequently",
    avoidance: "Skips high-stakes tasks",
    perfectionism: "Waits for perfect before shipping",
  };
  const sources = [
    ...bundle.identitySignals.map((s) => s.description).filter(Boolean),
    ...bundle.mentorMemories.filter((m) => ACHIEVEMENT.test(m.text)).map((m) => m.text),
    ...understands,
  ];
  const bullets = formatKnowledgeBulletsForRail(sources);
  const topPattern = bundle.patterns?.[0]?.pattern;
  if (topPattern && bullets.length < 4) {
    const label = PATTERN_LABELS[topPattern] || `Pattern: ${topPattern.replace(/_/g, " ")}`;
    if (!bullets.some((b) => b.toLowerCase().includes(topPattern.replace(/_/g, " ")))) {
      bullets.push(trimKnowledgeBullet(label));
    }
  }
  return bullets.slice(0, 4);
}

function computeConfidence(input: {
  hasPrimary: boolean;
  goalAnalysis: GoalAnalysis | null;
  completedTasks7d: number;
  reflections7d: number;
}): UserModelConfidence {
  if (!input.hasPrimary) return "low";
  const missing = input.goalAnalysis?.missingVariables.length ?? 3;
  if (missing === 0 && input.completedTasks7d >= 2) return "high";
  if (missing <= 2 || input.completedTasks7d >= 1 || input.reflections7d >= 1) return "moderate";
  return "low";
}

function buildRecentActivity(completedTasks7d: number, reflections7d: number): string | null {
  if (completedTasks7d >= 3) {
    return `${completedTasks7d} tasks completed in the last 7 days — execution data is building.`;
  }
  if (completedTasks7d >= 1) {
    return `${completedTasks7d} task completed this week.`;
  }
  if (reflections7d >= 1) {
    return "Reflections logged but no completed tasks yet this week.";
  }
  return "No tasks or reflections logged recently.";
}

export async function synthesizeUserModel(
  supabase: SupabaseClient,
  userId: string
): Promise<UserModel> {
  const ctx = await loadExecutionContext(supabase, userId);
  const primary = ctx.primaryInitiative;

  if (!primary) {
    const empty = emptyUserModel();
    empty.identity.vision = ctx.profile?.vision ?? null;
    empty.identity.longTermDirections = dedupeSemanticThemes(ctx.goals.map((g) => g.title));
    empty.recentActivity = buildRecentActivity(ctx.completedTasks7d, ctx.reflections7d);
    empty.executionStats = {
      completedTasks7d: ctx.completedTasks7d,
      reflections7d: ctx.reflections7d,
    };

    const identityProfile = await loadIdentityProfile(supabase, userId);
    const bundle = await buildEvidenceBundle(supabase, userId, identityProfile);
    const retrievalCtx = await loadMemoryRetrievalContext(supabase, userId, bundle);
    const coverage = identityProfile.lastCoverage ?? computeBaselineCoverage(bundle);
    const whoAmI = buildEvidenceBasedWhoAmI(bundle, coverage, retrievalCtx);
    empty.whoAmIAnswer = sanitizeCoachCopy(whoAmI.answer);
    empty.whoAmIStatements = whoAmI.statements;
    empty.evidence = whoAmI.evidence;
    empty.identityCoverage = coverage;
    empty.overallIdentityCoverage = averageCoverage(coverage);
    empty.memoryGraphSummary = formatMemoryGraphSummary(retrievalCtx);
    empty.secondaryFocusAreas = [
      ...retrievalCtx.recentEmergingAreas,
      ...retrievalCtx.secondaryLifeAreas.map((a) => a.label),
    ].filter((v, i, arr) => arr.indexOf(v) === i);

    await supabase
      .from("profiles")
      .update({
        user_model: empty,
        user_model_updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    return empty;
  }

  const { allocation, portfolio } = computeExecutionAllocation(
    ctx.initiatives,
    ctx.focusInitiativeId ?? primary.id
  );

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [patternsRes, profileExtraRes, reflectionsRes] = await Promise.all([
    supabase
      .from("execution_patterns")
      .select("pattern, behavioral_impact, severity")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(4),
    supabase
      .from("profiles")
      .select("work_style, lifestyle_issues, cognitive_state")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("daily_reflections")
      .select("blocked_by")
      .eq("user_id", userId)
      .gte("reflection_date", sevenDaysAgo.toISOString().split("T")[0])
      .order("reflection_date", { ascending: false })
      .limit(3),
  ]);

  const _patterns = patternsRes.data || [];
  const _profileExtra = profileExtraRes.data;
  const _reflectionBlocks = (reflectionsRes.data || [])
    .map((r) => r.blocked_by?.trim())
    .filter(Boolean) as string[];

  const _initiativeThemes = ctx.initiatives.map((i) => ({
    title: i.title,
    lifeArea: i.life_area,
    domain: detectDomain(`${i.title} ${i.description || ""}`, i.life_area),
  }));

  const planContext = await loadPlanContextData(supabase, userId, primary.id);
  const linkedGoal = primary.parent_goal_id
    ? ctx.goals.find((g) => g.id === primary.parent_goal_id)
    : null;
  const goalTexts = linkedGoal ? [linkedGoal.title] : [];

  const domain = detectDomain(`${primary.title} ${primary.description || ""}`, primary.life_area);
  const goalAnalysis = buildGoalAnalysis({
    domain,
    initiativeTitle: primary.title,
    initiativeDescription: primary.description ?? undefined,
    targetDate: primary.target_date,
    lifeArea: primary.life_area,
    goalTexts,
    planContext: planContext as Record<string, unknown>,
  });

  const ninetyDay =
    planContext.initiativeOutcome90d?.trim() ||
    primary.description?.match(/90-day outcome:\s*(.+)/i)?.[1]?.trim() ||
    null;

  const obstacles: string[] = [];
  if (planContext.biggestObstacle?.trim()) obstacles.push(planContext.biggestObstacle.trim());

  const primaryHeadline = buildPrimaryHeadline({
    title: primary.title,
    description: primary.description,
    targetDate: primary.target_date,
    ninetyDayOutcome: ninetyDay,
    domain,
  });

  const secondaryOutcomes = [
    ...ctx.initiatives
      .filter((i) => i.id !== primary.id)
      .map((i) => ({
        id: i.id,
        title: i.title,
        lifeArea: i.life_area,
        role: "initiative" as const,
        targetDate: i.target_date,
      })),
    ...ctx.goals
      .filter((g) => g.id !== primary.parent_goal_id)
      .map((g) => ({
        id: g.id,
        title: g.title,
        lifeArea: g.category,
        role: "direction" as const,
        targetDate: g.target_date,
      })),
  ].slice(0, 6);

  const identityLabels: string[] = [];

  const recentActivity = buildRecentActivity(ctx.completedTasks7d, ctx.reflections7d);

  const dedupedDirections = dedupeSemanticThemes(ctx.goals.map((g) => g.title));

  const model: UserModel = {
    version: USER_MODEL_VERSION,
    synthesizedAt: new Date().toISOString(),
    identity: {
      labels: identityLabels,
      vision: ctx.profile?.vision ?? null,
      longTermDirections: dedupedDirections,
    },
    currentFocus: {
      initiativeId: primary.id,
      title: primary.title,
      lifeArea: primary.life_area,
      domain,
      until: ctx.profile?.current_focus_until || primary.target_date,
    },
    primaryOutcome: {
      headline: primaryHeadline,
      ninetyDayOutcome: ninetyDay,
      targetDate: primary.target_date,
    },
    secondaryOutcomes,
    activePortfolio: portfolio,
    executionAllocation: allocation,
    obstacles,
    stillNeeds: goalAnalysis.missingVariables.map((m) => m.label),
    understands: goalAnalysis.knownFacts.filter((f) => !f.startsWith("Initiative:")),
    recentActivity,
    currentMilestone: ctx.currentMilestone?.title ?? null,
    opportunities: ctx.opportunities.map((o) => o.title),
    planningSnapshot: {
      trainingDaysPerWeek: planContext.trainingDaysPerWeek as number | null | undefined,
      weeklyAvailableHours: planContext.weeklyAvailableHours as number | null | undefined,
      studyHoursPerDay: planContext.studyHoursPerDay as number | null | undefined,
      currentBodyFatPct: planContext.currentBodyFatPct as number | null | undefined,
    },
    executionStats: {
      completedTasks7d: ctx.completedTasks7d,
      reflections7d: ctx.reflections7d,
    },
    confidence: computeConfidence({
      hasPrimary: true,
      goalAnalysis,
      completedTasks7d: ctx.completedTasks7d,
      reflections7d: ctx.reflections7d,
    }),
    narrative: "",
    whoAmIAnswer: "",
    whoAmIStatements: [],
    evidence: [],
    identityCoverage: emptyIdentityCoverage(),
    overallIdentityCoverage: 0,
  };

  const identityProfile = await loadIdentityProfile(supabase, userId);
  const bundle = await buildEvidenceBundle(supabase, userId, identityProfile);
  const retrievalCtx = await loadMemoryRetrievalContext(supabase, userId, bundle);
  const coverage = identityProfile.lastCoverage ?? computeBaselineCoverage(bundle);
  const whoAmI = buildEvidenceBasedWhoAmI(bundle, coverage, retrievalCtx);

  model.whoAmIAnswer = sanitizeCoachCopy(whoAmI.answer);
  model.whoAmIStatements = whoAmI.statements;
  model.evidence = whoAmI.evidence;
  model.memoryGraphSummary = formatMemoryGraphSummary(retrievalCtx);
  model.secondaryFocusAreas = [
    ...retrievalCtx.recentEmergingAreas,
    ...retrievalCtx.secondaryLifeAreas.map((a) => a.label),
  ].filter((v, i, arr) => arr.indexOf(v) === i);
  model.identityCoverage = coverage;
  model.overallIdentityCoverage = averageCoverage(coverage);

  for (const entry of model.activePortfolio) {
    entry.isFocus = entry.initiativeId === primary.id;
  }
  if (model.currentFocus.initiativeId !== primary.id) {
    model.currentFocus.initiativeId = primary.id;
    model.currentFocus.title = primary.title;
    model.currentFocus.domain = domain;
  }

  model.narrative = buildUserModelNarrative({
    identityLabels: model.identity.labels,
    vision: model.identity.vision,
    primaryTitle: primary.title,
    primaryDomain: domain,
    primaryHeadline,
    secondaryTitles: secondaryOutcomes.map((o) => o.title),
    portfolioTitles: portfolio.filter((p) => !p.isFocus).map((p) => p.title),
    allocation: allocation.map((a) => ({ title: a.title, percent: a.percent, role: a.role })),
    obstacles,
    stillNeeds: model.stillNeeds,
    recentActivity,
  });

  model.knowledgeBullets = buildSynthesisKnowledgeBullets(bundle, model.understands);

  // Compute per-goal confidence scores (rule-based, no LLM)
  const [allPatternsRes, allSignalsRes] = await Promise.all([
    supabase
      .from("execution_patterns")
      .select("pattern, behavioral_impact")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(1),
    supabase
      .from("identity_signals")
      .select("type")
      .eq("user_id", userId)
      .eq("status", "active"),
  ]);
  const allPatterns = (allPatternsRes.data || []) as Array<{ pattern: string; behavioral_impact: string | null }>;
  const allSignals = (allSignalsRes.data || []) as Array<{ type: string }>;
  const hasObstacleCategory = allPatterns.length > 0;
  const obstacleDescription = allPatterns[0]?.behavioral_impact || null;
  const hasAvailableHours = allSignals.some((s) => s.type === "available_hours");
  const hasBudgetOrTools = allSignals.some((s) =>
    ["budget", "tools", "budget_constraint"].includes(s.type)
  );

  const goalConfidence: Record<string, import("@/lib/plans/goal-confidence").GoalConfidenceBreakdown> = {};
  for (const init of ctx.initiatives) {
    const { count: taskCount } = await supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("goal_id", init.id)
      .eq("status", "completed");
    goalConfidence[init.id] = computeGoalConfidence({
      targetDate: init.target_date,
      hasObstacleCategory,
      obstacleDescription,
      successCriteria: (init as { success_criteria?: string | null }).success_criteria ?? null,
      hasAvailableHours,
      hasBudgetOrTools,
      completedTaskCount: taskCount ?? 0,
    });
  }
  model.goalConfidence = goalConfidence;

  await supabase
    .from("profiles")
    .update({
      user_model: model,
      user_model_updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  invalidateUserCache(userId, "user model synthesis");

  return model;
}

export function scheduleUserModelRefresh(supabase: SupabaseClient, userId: string): void {
  void synthesizeUserModel(supabase, userId).catch((err) => {
    console.error("[UserModel] refresh failed:", err);
  });
}
