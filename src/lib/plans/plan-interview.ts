import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type ContextDimensionId,
  type DimensionInput,
  type PlanContextSnapshot,
  buildPlanContextSnapshot,
} from "@/lib/plans/plan-context-dimensions";
import {
  buildGoalAnalysis,
  detectDomain,
  type GoalAnalysis,
  type KnownFacts,
} from "@/lib/plans/coach-insights";
import {
  loadExecutionContext,
  resolvePrimaryInitiative,
} from "@/lib/user-model/resolve-context";
import { scheduleUserModelRefresh } from "@/lib/user-model/synthesis-engine";
import type { IdentityCoverageMap, IdentityDimensionId } from "@/lib/user-model/identity-dimensions";
import {
  getIdentityAskedToday,
  loadIdentityProfile,
  markIdentityQuestionSkipped,
  saveIdentityAnswer,
  saveIdentityCoverage,
} from "@/lib/plans/identity-profile-store";
import {
  pickNextPlanningQuestion,
  planningGapsForUi,
  shouldRunPlanningInterview,
} from "@/lib/plans/planning-interview";
import {
  applyInitiativeSideEffects,
  bumpCoverageAfterAnswer,
  mapAnswerToPlanContextPatch,
} from "@/lib/plans/interview-answer-map";
import { computeBaselineCoverage } from "@/lib/user-model/identity-synthesis";
import { averageCoverage } from "@/lib/user-model/identity-dimensions";

export interface PlanContextData {
  weeklyAvailableHours?: number | null;
  biggestObstacle?: string | null;
  initiativeOutcome90d?: string | null;
  businessFocus?: string | null;
  currentWeight?: number | null;
  currentBodyFatPct?: number | null;
  trainingDaysPerWeek?: number | null;
  studyHoursPerDay?: number | null;
  currentMetric?: string | null;
  /** Missing-variable ids asked today (domain-specific) */
  interviewAskedToday?: string[];
  interviewDate?: string;
}

/** Stored shape: per-initiative answers + optional legacy flat fields at root. */
interface PlanContextStore extends PlanContextData {
  byInitiative?: Record<string, PlanContextData>;
}

const LEGACY_FIELD_KEYS: (keyof PlanContextData)[] = [
  "weeklyAvailableHours",
  "biggestObstacle",
  "initiativeOutcome90d",
  "businessFocus",
  "currentWeight",
  "currentBodyFatPct",
  "trainingDaysPerWeek",
  "studyHoursPerDay",
  "currentMetric",
];

function hasLegacyFlatFields(store: PlanContextStore): boolean {
  return LEGACY_FIELD_KEYS.some((k) => store[k] != null && store[k] !== "");
}

function extractLegacyFields(store: PlanContextStore): PlanContextData {
  const out: PlanContextData = {};
  for (const k of LEGACY_FIELD_KEYS) {
    if (store[k] != null) (out as Record<string, unknown>)[k] = store[k];
  }
  return out;
}

function resetInterviewDay(raw: PlanContextData): PlanContextData {
  const today = new Date().toISOString().split("T")[0];
  if (raw.interviewDate !== today) {
    return { ...raw, interviewAskedToday: [], interviewDate: today };
  }
  return raw;
}

async function readPlanContextStore(
  supabase: SupabaseClient,
  userId: string
): Promise<PlanContextStore> {
  const { data } = await supabase
    .from("profiles")
    .select("plan_context")
    .eq("id", userId)
    .maybeSingle();
  return (data?.plan_context || {}) as PlanContextStore;
}

async function writePlanContextStore(
  supabase: SupabaseClient,
  userId: string,
  store: PlanContextStore
): Promise<void> {
  await supabase
    .from("profiles")
    .update({ plan_context: store, updated_at: new Date().toISOString() })
    .eq("id", userId);
}

/** Load planning interview answers scoped to one initiative (prevents cross-initiative leaks). */
export async function loadPlanContextData(
  supabase: SupabaseClient,
  userId: string,
  initiativeId: string
): Promise<PlanContextData> {
  const store = await readPlanContextStore(supabase, userId);
  store.byInitiative = store.byInitiative || {};

  if (store.byInitiative[initiativeId]) {
    return resetInterviewDay(store.byInitiative[initiativeId]);
  }

  if (hasLegacyFlatFields(store)) {
    const migrated = extractLegacyFields(store);
    store.byInitiative[initiativeId] = migrated;
    for (const k of LEGACY_FIELD_KEYS) {
      delete (store as Record<string, unknown>)[k];
    }
    await writePlanContextStore(supabase, userId, store);
    return resetInterviewDay(migrated);
  }

  return resetInterviewDay({});
}

export async function savePlanContextData(
  supabase: SupabaseClient,
  userId: string,
  initiativeId: string,
  patch: Partial<PlanContextData>
): Promise<PlanContextData> {
  const store = await readPlanContextStore(supabase, userId);
  store.byInitiative = store.byInitiative || {};
  const current = store.byInitiative[initiativeId] || (await loadPlanContextData(supabase, userId, initiativeId));
  const today = new Date().toISOString().split("T")[0];
  const merged: PlanContextData = {
    ...current,
    ...patch,
    interviewDate: today,
    interviewAskedToday: patch.interviewAskedToday ?? current.interviewAskedToday ?? [],
  };

  store.byInitiative[initiativeId] = merged;
  await writePlanContextStore(supabase, userId, store);
  return merged;
}

export async function buildDimensionInput(
  supabase: SupabaseClient,
  userId: string
): Promise<DimensionInput & { primaryInitiativeId: string | null }> {
  const exec = await loadExecutionContext(supabase, userId);
  const primary = exec.primaryInitiative;
  const primaryId = primary?.id ?? null;

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [goalsRes, initRes, patternsRes, tasksRes, reflectionsRes] = await Promise.all([
    supabase
      .from("goals")
      .select("title, description")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(10),
    supabase
      .from("initiatives")
      .select("title, description, target_date, life_area, id, goal_id, last_action_at")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("last_action_at", { ascending: false, nullsFirst: false })
      .limit(8),
    supabase
      .from("execution_patterns")
      .select("pattern, behavioral_impact")
      .eq("user_id", userId)
      .limit(4),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "completed")
      .gte("completed_at", sevenDaysAgo.toISOString()),
    supabase
      .from("daily_reflections")
      .select("blocked_by")
      .eq("user_id", userId)
      .order("reflection_date", { ascending: false })
      .limit(3),
  ]);

  const allInits = initRes.data || [];
  const orderedInits = primary
    ? [primary, ...allInits.filter((i) => i.id !== primary.id)]
    : allInits;

  const planContext = primaryId
    ? await loadPlanContextData(supabase, userId, primaryId)
    : resetInterviewDay({});

  return {
    goals: goalsRes.data || [],
    initiatives: orderedInits.map(({ id: _id, goal_id: _g, last_action_at: _l, ...rest }) => rest),
    patterns: patternsRes.data || [],
    recentCompletedTasks: tasksRes.count ?? 0,
    recentReflections: reflectionsRes.data || [],
    planContext,
    questionsAskedToday: planContext.interviewAskedToday || [],
    primaryInitiativeId: primaryId,
  };
}

export function buildKnownFactsFromInput(
  input: DimensionInput,
  primaryInitiative?: {
    title: string;
    description?: string | null;
    target_date?: string | null;
    life_area?: string | null;
    goal_id?: string | null;
  } | null,
  linkedGoalTitle?: string | null
): KnownFacts {
  const init = primaryInitiative ?? input.initiatives[0];
  const text = init ? `${init.title} ${init.description || ""}` : "";
  return {
    domain: detectDomain(text, init?.life_area),
    initiativeTitle: init?.title,
    initiativeDescription: init?.description ?? undefined,
    targetDate: init?.target_date,
    lifeArea: init?.life_area,
    goalTexts: linkedGoalTitle ? [linkedGoalTitle] : [],
    planContext: input.planContext as Record<string, unknown>,
  };
}

export interface InterviewQuestionPayload {
  variableId: string;
  dimension?: IdentityDimensionId;
  prompt: string;
  subtitle?: string;
  inputType: "text" | "number" | "date" | "choice";
  choices?: string[];
  expectedGain: number;
  biggestUnknown: string;
  questionNumber: number;
}

export async function getPlanContextState(
  supabase: SupabaseClient,
  userId: string,
  options?: { skipSideEffects?: boolean }
): Promise<{
  snapshot: PlanContextSnapshot;
  goalAnalysis: GoalAnalysis | null;
  nextQuestion: InterviewQuestionPayload | null;
  biggestUnknown: string | null;
  identityCoverage: IdentityCoverageMap | null;
  overallCoverage: number | null;
  planningGaps: string[];
  stopReason?: string;
}> {
  const input = await buildDimensionInput(supabase, userId);
  const snapshot = buildPlanContextSnapshot(input);
  const exec = await loadExecutionContext(supabase, userId);
  const primary = exec.primaryInitiative;
  const linkedGoal = primary?.goal_id
    ? exec.goals.find((g) => g.id === primary.goal_id)
    : null;
  const facts = buildKnownFactsFromInput(input, primary, linkedGoal?.title ?? null);
  const goalAnalysis = primary ? buildGoalAnalysis(facts) : null;

  const identityProfile = await loadIdentityProfile(supabase, userId);
  const askedToday = getIdentityAskedToday(identityProfile);
  const planningGaps = planningGapsForUi(goalAnalysis, askedToday, input);

  const coverage =
    identityProfile.lastCoverage ??
    computeBaselineCoverage({
      vision: exec.profile?.vision ?? null,
      founderMode: Boolean(exec.profile?.founder_mode),
      workStyle: null,
      goals: exec.goals.map((g) => ({ title: g.title, category: g.category, targetDate: g.target_date })),
      initiatives: exec.initiatives.map((i) => ({
        id: i.id,
        title: i.title,
        description: i.description,
        lifeArea: i.life_area,
        domain: detectDomain(`${i.title} ${i.description || ""}`, i.life_area),
        targetDate: i.target_date,
      })),
      focusInitiativeId: exec.focusInitiativeId,
      focusTitle: primary?.title ?? null,
      focusDomain: primary
        ? detectDomain(`${primary.title} ${primary.description || ""}`, primary.life_area)
        : "general",
      identitySignals: exec.identitySignals,
      patterns: [],
      completedTasks7d: exec.completedTasks7d,
      reflections7d: exec.reflections7d,
      reflectionBlocks: [],
      opportunities: exec.opportunities.map((o) => o.title),
      planContextFields: input.planContext as Record<string, unknown>,
      identityAnswers: identityProfile.answers || {},
    });

  const overallCoverage = averageCoverage(coverage);

  if (!primary) {
    return {
      snapshot,
      goalAnalysis,
      nextQuestion: null,
      biggestUnknown: null,
      identityCoverage: coverage,
      overallCoverage,
      planningGaps: [],
      stopReason: "no_gaps",
    };
  }

  const nextQuestion = pickNextPlanningQuestion(input, goalAnalysis, askedToday);
  const shouldInterview = shouldRunPlanningInterview(input, goalAnalysis, askedToday);

  if (!options?.skipSideEffects) {
    await saveIdentityCoverage(supabase, userId, coverage, overallCoverage);
  }

  if (!shouldInterview || !nextQuestion) {
    return {
      snapshot: { ...snapshot, shouldInterview: false, stopReason: "no_gaps" },
      goalAnalysis,
      nextQuestion: null,
      biggestUnknown: planningGaps[0] ?? null,
      identityCoverage: coverage,
      overallCoverage,
      planningGaps,
      stopReason: "no_gaps",
    };
  }

  return {
    snapshot: { ...snapshot, shouldInterview: true },
    goalAnalysis,
    nextQuestion,
    biggestUnknown: nextQuestion.biggestUnknown || planningGaps[0] || null,
    identityCoverage: coverage,
    overallCoverage,
    planningGaps,
  };
}

export async function applyInterviewAnswer(
  supabase: SupabaseClient,
  userId: string,
  variableId: string,
  answer: string,
  dimension?: IdentityDimensionId
): Promise<void> {
  const trimmed = answer.trim();
  if (!trimmed) return;

  const exec = await loadExecutionContext(supabase, userId);
  const primary = exec.primaryInitiative;
  if (!primary) return;

  const effectiveDimension = dimension || "planning_baseline";

  await saveIdentityAnswer(supabase, userId, {
    questionId: variableId,
    dimension: effectiveDimension,
    value: trimmed,
  });

  const planContext = await loadPlanContextData(supabase, userId, primary.id);
  const asked = [...(planContext.interviewAskedToday || [])];
  if (!asked.includes(variableId)) asked.push(variableId);

  const patch: Partial<PlanContextData> = {
    interviewAskedToday: asked,
    ...mapAnswerToPlanContextPatch(variableId, trimmed, effectiveDimension),
  };

  await savePlanContextData(supabase, userId, primary.id, patch);

  void applyInitiativeSideEffects(
    supabase,
    userId,
    primary.id,
    variableId,
    trimmed,
    patch,
    primary.description
  ).catch(() => {});

  const identityProfile = await loadIdentityProfile(supabase, userId);
  const baseCoverage =
    identityProfile.lastCoverage ??
    computeBaselineCoverage({
      vision: exec.profile?.vision ?? null,
      founderMode: Boolean(exec.profile?.founder_mode),
      workStyle: null,
      goals: exec.goals.map((g) => ({ title: g.title, category: g.category, targetDate: g.target_date })),
      initiatives: exec.initiatives.map((i) => ({
        id: i.id,
        title: i.title,
        description: i.description,
        lifeArea: i.life_area,
        domain: detectDomain(`${i.title} ${i.description || ""}`, i.life_area),
        targetDate: i.target_date,
      })),
      focusInitiativeId: exec.focusInitiativeId,
      focusTitle: primary.title,
      focusDomain: detectDomain(`${primary.title} ${primary.description || ""}`, primary.life_area),
      identitySignals: exec.identitySignals,
      patterns: [],
      completedTasks7d: exec.completedTasks7d,
      reflections7d: exec.reflections7d,
      reflectionBlocks: [],
      opportunities: exec.opportunities.map((o) => o.title),
      planContextFields: { ...planContext, ...patch } as Record<string, unknown>,
      identityAnswers: identityProfile.answers || {},
    });

  const updatedCoverage = bumpCoverageAfterAnswer(baseCoverage, variableId, effectiveDimension);
  await saveIdentityCoverage(supabase, userId, updatedCoverage, averageCoverage(updatedCoverage));

  scheduleUserModelRefresh(supabase, userId);
}

export async function markInterviewSkipped(
  supabase: SupabaseClient,
  userId: string,
  variableId: string
): Promise<void> {
  await markIdentityQuestionSkipped(supabase, userId, variableId);

  const exec = await loadExecutionContext(supabase, userId);
  const primary = exec.primaryInitiative;
  if (!primary) return;

  const planContext = await loadPlanContextData(supabase, userId, primary.id);
  const asked = [...(planContext.interviewAskedToday || [])];
  if (!asked.includes(variableId)) asked.push(variableId);
  await savePlanContextData(supabase, userId, primary.id, { interviewAskedToday: asked });
  scheduleUserModelRefresh(supabase, userId);
}
