import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type ContextDimensionId,
  type DimensionInput,
  type PlanContextSnapshot,
  buildPlanContextSnapshot,
  pickNextInterviewDimension,
  questionForDimension,
} from "@/lib/plans/plan-context-dimensions";

export interface PlanContextData {
  weeklyAvailableHours?: number | null;
  biggestObstacle?: string | null;
  initiativeOutcome90d?: string | null;
  businessFocus?: string | null;
  interviewAskedToday?: ContextDimensionId[];
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
        .select("title, description, target_date")
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

export interface InterviewQuestionPayload {
  dimension: ContextDimensionId;
  prompt: string;
  subtitle?: string;
  inputType: "text" | "number" | "date";
}

export async function getPlanContextState(
  supabase: SupabaseClient,
  userId: string
): Promise<{
  snapshot: PlanContextSnapshot;
  nextQuestion: InterviewQuestionPayload | null;
}> {
  const input = await buildDimensionInput(supabase, userId);
  const snapshot = buildPlanContextSnapshot(input);
  const next = pickNextInterviewDimension(input);

  if (!next || !snapshot.shouldInterview) {
    return { snapshot, nextQuestion: null };
  }

  const q = questionForDimension(next.id, {
    initiativeTitle: input.initiatives[0]?.title,
  });

  return {
    snapshot,
    nextQuestion: {
      dimension: next.id,
      ...q,
    },
  };
}

export async function applyInterviewAnswer(
  supabase: SupabaseClient,
  userId: string,
  dimension: ContextDimensionId,
  answer: string
): Promise<void> {
  const trimmed = answer.trim();
  if (!trimmed) return;

  const planContext = await loadPlanContextData(supabase, userId);
  const asked = [...(planContext.interviewAskedToday || [])];
  if (!asked.includes(dimension)) asked.push(dimension);

  const patch: Partial<PlanContextData> = { interviewAskedToday: asked };

  switch (dimension) {
    case "goal_clarity":
      patch.businessFocus = trimmed;
      await supabase.from("goals").insert({
        user_id: userId,
        title: trimmed,
        category: "other",
        priority: "medium",
        status: "active",
        source: "plan_interview",
      });
      break;
    case "initiative_clarity":
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
    case "deadline_clarity":
      {
        const { data: init } = await supabase
          .from("initiatives")
          .select("id")
          .eq("user_id", userId)
          .eq("status", "active")
          .limit(1)
          .maybeSingle();
        if (init) {
          await supabase
            .from("initiatives")
            .update({ target_date: trimmed })
            .eq("id", init.id);
        }
      }
      break;
    case "obstacle_clarity":
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
    case "available_time":
      patch.weeklyAvailableHours = Math.min(80, Math.max(1, Number(trimmed) || 0));
      break;
    default:
      break;
  }

  await savePlanContextData(supabase, userId, patch);
}

export async function markInterviewSkipped(
  supabase: SupabaseClient,
  userId: string,
  dimension: ContextDimensionId
): Promise<void> {
  const planContext = await loadPlanContextData(supabase, userId);
  const asked = [...(planContext.interviewAskedToday || [])];
  if (!asked.includes(dimension)) asked.push(dimension);
  await savePlanContextData(supabase, userId, { interviewAskedToday: asked });
}
