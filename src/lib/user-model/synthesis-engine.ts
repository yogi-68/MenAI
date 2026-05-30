import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildGoalAnalysis,
  detectDomain,
  type GoalAnalysis,
} from "@/lib/plans/coach-insights";
import { loadPlanContextData } from "@/lib/plans/plan-interview";
import { loadExecutionContext } from "@/lib/user-model/resolve-context";
import type { UserModel, UserModelConfidence } from "@/lib/user-model/types";
import { USER_MODEL_VERSION } from "@/lib/user-model/types";
import {
  buildPrimaryHeadline,
  buildUserModelNarrative,
  buildWhoAmIAnswer,
  emptyUserModel,
} from "@/lib/user-model/narrative";
import { computeExecutionAllocation } from "@/lib/user-model/execution-allocation";

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

function buildIdentityLabels(input: {
  vision: string | null;
  founderMode: boolean;
  signals: Array<{ description: string; long_term_direction: string | null }>;
  goals: Array<{ title: string; category: string | null }>;
}): string[] {
  const labels = new Set<string>();

  if (input.founderMode) labels.add("Entrepreneurial");
  if (input.vision) {
    if (/wealth|financial|freedom|money/i.test(input.vision)) labels.add("Long-term wealth builder");
    if (/health|fitness|body/i.test(input.vision)) labels.add("Health-focused");
    if (/learn|study|exam/i.test(input.vision)) labels.add("Dedicated learner");
  }

  for (const s of input.signals) {
    const t = s.long_term_direction || s.description;
    if (t && t.length < 80) labels.add(t);
  }

  for (const g of input.goals.slice(0, 3)) {
    if (/business|startup|saas|revenue/i.test(g.title)) labels.add("Business builder");
    if (/financial|wealth|freedom/i.test(g.title)) labels.add("Financial independence seeker");
  }

  return [...labels].slice(0, 5);
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
    empty.identity.longTermDirections = ctx.goals.map((g) => g.title);
    empty.recentActivity = buildRecentActivity(ctx.completedTasks7d, ctx.reflections7d);
    empty.whoAmIAnswer = buildWhoAmIAnswer(empty);

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

  const planContext = await loadPlanContextData(supabase, userId, primary.id);
  const linkedGoal = primary.goal_id
    ? ctx.goals.find((g) => g.id === primary.goal_id)
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
      .filter((g) => g.id !== primary.goal_id)
      .map((g) => ({
        id: g.id,
        title: g.title,
        lifeArea: g.category,
        role: "direction" as const,
        targetDate: g.target_date,
      })),
  ].slice(0, 6);

  const identityLabels = buildIdentityLabels({
    vision: ctx.profile?.vision ?? null,
    founderMode: Boolean(ctx.profile?.founder_mode),
    signals: ctx.identitySignals,
    goals: ctx.goals,
  });

  const recentActivity =
    buildRecentActivity(ctx.completedTasks7d, ctx.reflections7d) ||
    ctx.recentTimelineHeadline;

  const model: UserModel = {
    version: USER_MODEL_VERSION,
    synthesizedAt: new Date().toISOString(),
    identity: {
      labels: identityLabels,
      vision: ctx.profile?.vision ?? null,
      longTermDirections: ctx.goals.map((g) => g.title),
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
    confidence: computeConfidence({
      hasPrimary: true,
      goalAnalysis,
      completedTasks7d: ctx.completedTasks7d,
      reflections7d: ctx.reflections7d,
    }),
    narrative: "",
    whoAmIAnswer: "",
  };

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

  model.whoAmIAnswer = buildWhoAmIAnswer(model);

  await supabase
    .from("profiles")
    .update({
      user_model: model,
      user_model_updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  return model;
}

export function scheduleUserModelRefresh(supabase: SupabaseClient, userId: string): void {
  void synthesizeUserModel(supabase, userId).catch((err) => {
    console.error("[UserModel] refresh failed:", err);
  });
}
