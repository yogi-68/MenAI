import type { SupabaseClient } from "@supabase/supabase-js";
import {
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
} from "@/lib/user-model/resolve-context";
import { scheduleUserModelRefresh } from "@/lib/user-model/synthesis-engine";
import {
  buildInterviewQuestionPayload,
  runAiIdentityInterviewStep,
} from "@/lib/plans/ai-identity-interview";
import {
  prefetchAiInterviewQuestion,
  runFastInterviewStep,
  scheduleUserModelRefreshOnce,
  tryGetCachedInterviewQuestion,
} from "@/lib/plans/interview-fast-path";
import { buildEvidenceBundle } from "@/lib/user-model/evidence-bundle";
import type { IdentityCoverageMap, IdentityDimensionId } from "@/lib/user-model/identity-dimensions";
import {
  getIdentityAskedToday,
  loadIdentityProfile,
  markIdentityQuestionSkipped,
  saveIdentityAnswer,
  saveIdentityCoverage,
} from "@/lib/plans/identity-profile-store";

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
  patch: Partial<PlanContextData>,
  options?: { skipUserModelRefresh?: boolean }
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
  if (!options?.skipUserModelRefresh) {
    scheduleUserModelRefresh(supabase, userId);
  }
  return merged;
}

export async function buildDimensionInput(
  supabase: SupabaseClient,
  userId: string,
  cachedExec?: Awaited<ReturnType<typeof loadExecutionContext>>
): Promise<DimensionInput & { primaryInitiativeId: string | null }> {
  const exec = cachedExec ?? (await loadExecutionContext(supabase, userId));
  const primary = exec.primaryInitiative;
  const primaryId = primary?.id ?? null;

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [goalsRes, initRes, patternsRes, tasksRes, reflectionsRes] = await Promise.all([
    supabase
      .from("goals")
      .select("title, description")
      .eq("user_id", userId)
      .eq("goal_kind", "direction")
      .eq("status", "active")
      .limit(10),
    supabase
      .from("goals")
      .select("title, description, target_date, life_area, id, parent_goal_id, last_action_at")
      .eq("user_id", userId)
      .eq("goal_kind", "execution")
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
    initiatives: orderedInits.map(({ id: _id, parent_goal_id: _g, last_action_at: _l, ...rest }) => rest),
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
    parent_goal_id?: string | null;
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
  userId: string
): Promise<{
  snapshot: PlanContextSnapshot;
  goalAnalysis: GoalAnalysis | null;
  nextQuestion: InterviewQuestionPayload | null;
  biggestUnknown: string | null;
  identityCoverage: IdentityCoverageMap | null;
  overallCoverage: number | null;
  stopReason?: string;
}> {
  const exec = await loadExecutionContext(supabase, userId);
  const input = await buildDimensionInput(supabase, userId, exec);
  const snapshot = buildPlanContextSnapshot(input);
  const primary = exec.primaryInitiative;
  const linkedGoal = primary?.parent_goal_id
    ? exec.goals.find((g) => g.id === primary.parent_goal_id)
    : null;
  const facts = buildKnownFactsFromInput(input, primary, linkedGoal?.title ?? null);
  const goalAnalysis = primary ? buildGoalAnalysis(facts) : null;

  const identityProfile = await loadIdentityProfile(supabase, userId);
  const askedToday = getIdentityAskedToday(identityProfile);

  const cached = await tryGetCachedInterviewQuestion(supabase, userId);
  if (cached?.question) {
    const questionNumber = askedToday.length + 1;
    return {
      snapshot: { ...snapshot, shouldInterview: true },
      goalAnalysis,
      nextQuestion: buildInterviewQuestionPayload(cached.question, questionNumber),
      biggestUnknown: cached.weakestLabel,
      identityCoverage: cached.coverage,
      overallCoverage: cached.overallCoverage,
    };
  }

  const bundle = await buildEvidenceBundle(supabase, userId, identityProfile);
  const interview = await runAiIdentityInterviewStep({
    bundle,
    identityProfile,
    askedToday,
    userId,
  });

  await saveIdentityCoverage(supabase, userId, interview.coverage, interview.overallCoverage);

  if (interview.question && interview.shouldContinue) {
    prefetchAiInterviewQuestion(supabase, userId);
  }

  if (!primary) {
    return {
      snapshot,
      goalAnalysis,
      nextQuestion: null,
      biggestUnknown: null,
      identityCoverage: interview.coverage,
      overallCoverage: interview.overallCoverage,
      stopReason: "no_gaps",
    };
  }

  if (!interview.shouldContinue || !interview.question) {
    return {
      snapshot: { ...snapshot, shouldInterview: false, stopReason: interview.stopReason },
      goalAnalysis,
      nextQuestion: null,
      biggestUnknown: interview.weakestLabel,
      identityCoverage: interview.coverage,
      overallCoverage: interview.overallCoverage,
      stopReason: interview.stopReason,
    };
  }

  const questionNumber = askedToday.length + 1;

  return {
    snapshot: { ...snapshot, shouldInterview: true },
    goalAnalysis,
    nextQuestion: buildInterviewQuestionPayload(interview.question, questionNumber),
    biggestUnknown: interview.weakestLabel || interview.question.subtitle || null,
    identityCoverage: interview.coverage,
    overallCoverage: interview.overallCoverage,
    stopReason: undefined,
  };
}

/** Fast path for answer submit — no OpenAI wait. */
export async function getFastInterviewResponse(
  supabase: SupabaseClient,
  userId: string,
  dimension?: IdentityDimensionId
): Promise<{
  nextQuestion: InterviewQuestionPayload | null;
  biggestUnknown: string | null;
  identityCoverage: IdentityCoverageMap;
  overallCoverage: number;
  done: boolean;
  stopReason?: string;
  shouldInterview: boolean;
}> {
  const exec = await loadExecutionContext(supabase, userId);
  const profile = await loadIdentityProfile(supabase, userId);
  const askedToday = getIdentityAskedToday(profile);

  const fast = await runFastInterviewStep(supabase, userId, {
    bumpedDimension: dimension,
    initiativeCount: exec.initiatives.length,
  });

  const done = !fast.shouldContinue || !fast.question;
  const questionNumber = askedToday.length + 1;

  return {
    nextQuestion: done || !fast.question
      ? null
      : buildInterviewQuestionPayload(fast.question, questionNumber),
    biggestUnknown: done ? null : fast.weakestLabel,
    identityCoverage: fast.coverage,
    overallCoverage: fast.overallCoverage,
    done,
    stopReason: fast.stopReason,
    shouldInterview: !done,
  };
}

export async function applyInterviewAnswer(
  supabase: SupabaseClient,
  userId: string,
  variableId: string,
  answer: string,
  dimension?: IdentityDimensionId
): Promise<{ initiativeCount: number }> {
  const trimmed = answer.trim();
  if (!trimmed) return { initiativeCount: 0 };

  const exec = await loadExecutionContext(supabase, userId);
  const primary = exec.primaryInitiative;
  if (!primary) return { initiativeCount: 0 };

  const planContext = await loadPlanContextData(supabase, userId, primary.id);
  const asked = [...(planContext.interviewAskedToday || [])];
  if (!asked.includes(variableId)) asked.push(variableId);

  const patch: Partial<PlanContextData> = { interviewAskedToday: asked };
  const sideEffects: Promise<unknown>[] = [];

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
      sideEffects.push(
        (async () => {
          await supabase.from("commitments").insert({
            user_id: userId,
            description: `Current blocker: ${trimmed}`,
            category: "work",
            timeframe: "ongoing",
            status: "active",
            source: "plan_interview",
          });
        })()
      );
      break;
    case "initiativeOutcome90d":
      patch.initiativeOutcome90d = trimmed;
      sideEffects.push(
        (async () => {
          await supabase
            .from("goals")
            .update({
              description: primary.description
                ? `${primary.description}\n90-day outcome: ${trimmed}`
                : `90-day outcome: ${trimmed}`,
            })
            .eq("id", primary.id);
        })()
      );
      break;
    case "currentMetric":
      patch.currentMetric = trimmed;
      break;
    case "targetDate":
      sideEffects.push(
        (async () => {
          await supabase.from("goals").update({ target_date: trimmed }).eq("id", primary.id);
        })()
      );
      break;
    default:
      if (/obstacle|constraint|blocker/i.test(variableId)) {
        patch.biggestObstacle = trimmed;
      } else if (/hour|time|capacity/i.test(variableId)) {
        patch.weeklyAvailableHours = Math.min(80, Math.max(1, Number(trimmed) || 0));
      } else if (/bodyfat|body_fat/i.test(variableId)) {
        patch.currentBodyFatPct = Math.min(60, Math.max(3, Number(trimmed) || 0));
      } else if (/weight/i.test(variableId)) {
        patch.currentWeight = Number(trimmed) || null;
      } else if (/train/i.test(variableId)) {
        patch.trainingDaysPerWeek = Math.min(7, Math.max(1, Number(trimmed) || 0));
      } else if (/metric|customer|mrr|user/i.test(variableId)) {
        patch.currentMetric = trimmed;
      }
      break;
  }

  if (dimension) {
    sideEffects.push(
      saveIdentityAnswer(
        supabase,
        userId,
        { questionId: variableId, dimension, value: trimmed },
        { skipUserModelRefresh: true }
      )
    );
  }

  sideEffects.push(
    savePlanContextData(supabase, userId, primary.id, patch, { skipUserModelRefresh: true })
  );

  await Promise.all(sideEffects);
  scheduleUserModelRefreshOnce(supabase, userId);

  return { initiativeCount: exec.initiatives.length };
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
  await savePlanContextData(supabase, userId, primary.id, { interviewAskedToday: asked }, {
    skipUserModelRefresh: true,
  });
  scheduleUserModelRefreshOnce(supabase, userId);
}
