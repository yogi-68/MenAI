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
import { getUserModel } from "@/lib/user-model/loader";
import {
  buildDynamicQuestionPayload,
  evaluateInterviewContinuation,
  generateDynamicInterviewQuestion,
  type DynamicQuestionPayload,
} from "@/lib/plans/dynamic-interview";

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
  scheduleUserModelRefresh(supabase, userId);
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

export interface InterviewQuestionPayload extends DynamicQuestionPayload {}

export async function getPlanContextState(
  supabase: SupabaseClient,
  userId: string
): Promise<{
  snapshot: PlanContextSnapshot;
  goalAnalysis: GoalAnalysis | null;
  nextQuestion: InterviewQuestionPayload | null;
  biggestUnknown: string | null;
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

  if (!goalAnalysis || !primary) {
    return {
      snapshot,
      goalAnalysis,
      nextQuestion: null,
      biggestUnknown: null,
      stopReason: "no_gaps",
    };
  }

  const continuation = evaluateInterviewContinuation({
    missing: goalAnalysis.missingVariables,
    askedToday: input.planContext.interviewAskedToday || [],
    overallScore: snapshot.overall,
    hasInitiatives: input.initiatives.length > 0,
  });

  if (!continuation.shouldInterview || !continuation.nextGap) {
    return {
      snapshot: { ...snapshot, shouldInterview: false, stopReason: continuation.stopReason },
      goalAnalysis,
      nextQuestion: null,
      biggestUnknown: continuation.nextGap?.label ?? null,
      stopReason: continuation.stopReason,
    };
  }

  const userModel = await getUserModel(supabase, userId);
  const questionNumber = (input.planContext.interviewAskedToday || []).length + 1;
  const generated = await generateDynamicInterviewQuestion({
    gap: continuation.nextGap,
    goalAnalysis,
    userModel,
    initiativeTitle: primary.title,
    domain: facts.domain,
    questionNumber,
    userId,
  });

  return {
    snapshot: { ...snapshot, shouldInterview: true },
    goalAnalysis,
    nextQuestion: buildDynamicQuestionPayload(continuation.nextGap, generated, questionNumber),
    biggestUnknown: continuation.nextGap.label,
    stopReason: undefined,
  };
}

export async function applyInterviewAnswer(
  supabase: SupabaseClient,
  userId: string,
  variableId: string,
  answer: string
): Promise<void> {
  const trimmed = answer.trim();
  if (!trimmed) return;

  const exec = await loadExecutionContext(supabase, userId);
  const primary = exec.primaryInitiative;
  if (!primary) return;

  const planContext = await loadPlanContextData(supabase, userId, primary.id);
  const asked = [...(planContext.interviewAskedToday || [])];
  if (!asked.includes(variableId)) asked.push(variableId);

  const patch: Partial<PlanContextData> = { interviewAskedToday: asked };

  switch (variableId) {
    case "currentWeight":
      patch.currentWeight = Number(trimmed) || null;
      break;
    case "currentBodyFatPct":
      patch.currentBodyFatPct = Math.min(60, Math.max(3, Number(trimmed) || 0));
      break;
    case "trainingDaysPerWeek":
      patch.trainingDaysPerWeek = Math.min(7, Math.max(1, Number(trimmed) || 0));
      break;
    case "studyHoursPerDay":
      patch.studyHoursPerDay = Math.min(16, Math.max(1, Number(trimmed) || 0));
      break;
    case "weeklyAvailableHours":
      patch.weeklyAvailableHours = Math.min(80, Math.max(1, Number(trimmed) || 0));
      break;
    case "biggestObstacle":
      patch.biggestObstacle = trimmed;
      await supabase.from("commitments").insert({
        user_id: userId,
        description: `Current blocker: ${trimmed}`,
        category: "work",
        timeframe: "ongoing",
        status: "active",
        source: "plan_interview",
      });
      break;
    case "initiativeOutcome90d":
      patch.initiativeOutcome90d = trimmed;
      await supabase
        .from("initiatives")
        .update({
          description: primary.description
            ? `${primary.description}\n90-day outcome: ${trimmed}`
            : `90-day outcome: ${trimmed}`,
        })
        .eq("id", primary.id);
      break;
    case "currentMetric":
      patch.currentMetric = trimmed;
      break;
    case "targetDate":
      await supabase.from("initiatives").update({ target_date: trimmed }).eq("id", primary.id);
      break;
    default:
      break;
  }

  await savePlanContextData(supabase, userId, primary.id, patch);
}

export async function markInterviewSkipped(
  supabase: SupabaseClient,
  userId: string,
  variableId: string
): Promise<void> {
  const exec = await loadExecutionContext(supabase, userId);
  const primary = exec.primaryInitiative;
  if (!primary) return;

  const planContext = await loadPlanContextData(supabase, userId, primary.id);
  const asked = [...(planContext.interviewAskedToday || [])];
  if (!asked.includes(variableId)) asked.push(variableId);
  await savePlanContextData(supabase, userId, primary.id, { interviewAskedToday: asked });
}
