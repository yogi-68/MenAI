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
  pickNextMissingQuestion,
  type GoalAnalysis,
  type KnownFacts,
} from "@/lib/plans/coach-insights";

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

export async function loadPlanContextData(
  supabase: SupabaseClient,
  userId: string
): Promise<PlanContextData> {
  const { data } = await supabase
    .from("profiles")
    .select("plan_context")
    .eq("id", userId)
    .maybeSingle();

  const raw = (data?.plan_context || {}) as PlanContextData;
  const today = new Date().toISOString().split("T")[0];
  if (raw.interviewDate !== today) {
    return { ...raw, interviewAskedToday: [], interviewDate: today };
  }
  return raw;
}

export async function savePlanContextData(
  supabase: SupabaseClient,
  userId: string,
  patch: Partial<PlanContextData>
): Promise<PlanContextData> {
  const current = await loadPlanContextData(supabase, userId);
  const today = new Date().toISOString().split("T")[0];
  const merged: PlanContextData = {
    ...current,
    ...patch,
    interviewDate: today,
    interviewAskedToday: patch.interviewAskedToday ?? current.interviewAskedToday ?? [],
  };

  await supabase
    .from("profiles")
    .update({ plan_context: merged, updated_at: new Date().toISOString() })
    .eq("id", userId);

  return merged;
}

export async function buildDimensionInput(
  supabase: SupabaseClient,
  userId: string
): Promise<DimensionInput> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [goalsRes, initRes, patternsRes, tasksRes, reflectionsRes, planContext] =
    await Promise.all([
      supabase
        .from("goals")
        .select("title, description")
        .eq("user_id", userId)
        .eq("status", "active")
        .limit(10),
      supabase
        .from("initiatives")
        .select("title, description, target_date, life_area")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("target_date", { ascending: true })
        .limit(3),
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
      loadPlanContextData(supabase, userId),
    ]);

  return {
    goals: goalsRes.data || [],
    initiatives: initRes.data || [],
    patterns: patternsRes.data || [],
    recentCompletedTasks: tasksRes.count ?? 0,
    recentReflections: reflectionsRes.data || [],
    planContext,
    questionsAskedToday: planContext.interviewAskedToday || [],
  };
}

export function buildKnownFactsFromInput(input: DimensionInput): KnownFacts {
  const init = input.initiatives[0];
  const text = init ? `${init.title} ${init.description || ""}` : "";
  return {
    domain: detectDomain(text, init?.life_area),
    initiativeTitle: init?.title,
    initiativeDescription: init?.description ?? undefined,
    targetDate: init?.target_date,
    lifeArea: init?.life_area,
    goalTexts: input.goals.map((g) => g.title),
    planContext: input.planContext as Record<string, unknown>,
  };
}

export interface InterviewQuestionPayload {
  variableId: string;
  prompt: string;
  subtitle?: string;
  inputType: "text" | "number" | "date";
}

export async function getPlanContextState(
  supabase: SupabaseClient,
  userId: string
): Promise<{
  snapshot: PlanContextSnapshot;
  goalAnalysis: GoalAnalysis | null;
  nextQuestion: InterviewQuestionPayload | null;
}> {
  const input = await buildDimensionInput(supabase, userId);
  const snapshot = buildPlanContextSnapshot(input);
  const facts = buildKnownFactsFromInput(input);
  const goalAnalysis = input.initiatives.length > 0 ? buildGoalAnalysis(facts) : null;

  if (!snapshot.shouldInterview || !goalAnalysis) {
    return { snapshot, goalAnalysis, nextQuestion: null };
  }

  const next = pickNextMissingQuestion(
    goalAnalysis.missingVariables,
    input.planContext.interviewAskedToday || []
  );

  if (!next) {
    return { snapshot, goalAnalysis, nextQuestion: null };
  }

  return {
    snapshot,
    goalAnalysis,
    nextQuestion: {
      variableId: next.id,
      prompt: next.question,
      subtitle: next.why,
      inputType: next.inputType,
    },
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

  const planContext = await loadPlanContextData(supabase, userId);
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
      {
        const { data: init } = await supabase
          .from("initiatives")
          .select("id, description")
          .eq("user_id", userId)
          .eq("status", "active")
          .limit(1)
          .maybeSingle();
        if (init) {
          await supabase
            .from("initiatives")
            .update({
              description: init.description
                ? `${init.description}\n90-day outcome: ${trimmed}`
                : `90-day outcome: ${trimmed}`,
            })
            .eq("id", init.id);
        }
      }
      break;
    case "currentMetric":
      patch.currentMetric = trimmed;
      break;
    case "targetDate":
      {
        const { data: init } = await supabase
          .from("initiatives")
          .select("id")
          .eq("user_id", userId)
          .eq("status", "active")
          .limit(1)
          .maybeSingle();
        if (init) {
          await supabase.from("initiatives").update({ target_date: trimmed }).eq("id", init.id);
        }
      }
      break;
    default:
      break;
  }

  await savePlanContextData(supabase, userId, patch);
}

export async function markInterviewSkipped(
  supabase: SupabaseClient,
  userId: string,
  variableId: string
): Promise<void> {
  const planContext = await loadPlanContextData(supabase, userId);
  const asked = [...(planContext.interviewAskedToday || [])];
  if (!asked.includes(variableId)) asked.push(variableId);
  await savePlanContextData(supabase, userId, { interviewAskedToday: asked });
}
