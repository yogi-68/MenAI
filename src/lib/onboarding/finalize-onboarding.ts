import { recordPattern } from "@/lib/patterns/record";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  OBSTACLE_PATTERN_MAP,
  ONBOARDING_QUESTIONS,
} from "@/lib/onboarding/questions";
import { generateMilestonesForGoal } from "@/lib/plans/milestone-generator";
import { cancelLegacyDirectionTasks } from "@/lib/plans/legacy-task-cleanup";
import { ensureTodayPlan } from "@/lib/plans/daily-plan-generator";
import { synthesizeUserModel } from "@/lib/user-model/synthesis-engine";
import { assessGoalQuality } from "@/lib/goals/goal-quality-gate";
import { inferAreaFromText } from "@/lib/plans/life-area-balancer";
import { trackProductEventOnce } from "@/lib/analytics/track-event";
import { savePlanContextData } from "@/lib/plans/plan-interview";
import { invalidateUserCache } from "@/lib/ai/orchestrator/cache-invalidation";

interface StoredResponse {
  question_id: string;
  response_text: string | null;
  response_data: { selected?: string | string[] } | null;
}

export type FinalizeStep =
  | "creating_goal"
  | "building_milestones"
  | "generating_plan"
  | "setting_up_coach"
  | "done";

export class FinalizeOnboardingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FinalizeOnboardingError";
  }
}

function deadlineFromDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

export function resolveTargetDate(q3: StoredResponse | undefined): string | null {
  const selected = String(q3?.response_data?.selected || "60");
  if (selected === "flexible") return null;
  if (selected === "custom" && q3?.response_text) {
    return q3.response_text.split("T")[0];
  }
  const days = Number(selected);
  return deadlineFromDays(Number.isFinite(days) ? days : 60);
}

function resolveObstacleLabel(obstacleKey: string, q4?: StoredResponse): string {
  if (obstacleKey === "other" && q4?.response_text?.trim()) {
    return q4.response_text.trim();
  }
  const option = ONBOARDING_QUESTIONS.Q4.options?.find((o) => o.value === obstacleKey);
  return option?.label || obstacleKey.replace(/_/g, " ");
}

function parseWeeklyHours(q5?: StoredResponse): { hours: number; label: string } | null {
  const selected = String(q5?.response_data?.selected || "");
  const map: Record<string, { hours: number; label: string }> = {
    "1-5": { hours: 3, label: "1–5 hours per week" },
    "5-10": { hours: 7, label: "5–10 hours per week" },
    "10-20": { hours: 15, label: "10–20 hours per week" },
    "20+": { hours: 25, label: "20+ hours per week" },
  };
  return map[selected] ?? null;
}

async function writeOnboardingIdentitySignals(
  supabase: SupabaseClient,
  userId: string,
  input: {
    goalTitle: string;
    lifeArea: string;
    obstacleLabel: string;
    successCriteria: string;
  }
): Promise<void> {
  const signals = [
    {
      type: "other",
      description: `Building toward: ${input.goalTitle}`,
      long_term_direction: input.lifeArea,
      confidence: 0.9,
    },
    {
      type: "self-discipline",
      description: `Primary obstacle: ${input.obstacleLabel}`,
      long_term_direction: null,
      confidence: 0.9,
    },
    ...(input.successCriteria
      ? [
          {
            type: "other",
            description: `Success looks like: ${input.successCriteria}`,
            long_term_direction: input.goalTitle,
            confidence: 0.9,
          },
        ]
      : []),
  ];

  for (const signal of signals) {
    const { data: existing } = await supabase
      .from("identity_signals")
      .select("id")
      .eq("user_id", userId)
      .eq("description", signal.description)
      .maybeSingle();

    if (existing) continue;

    await supabase.from("identity_signals").insert({
      user_id: userId,
      type: signal.type,
      description: signal.description,
      long_term_direction: signal.long_term_direction,
      confidence: signal.confidence,
      source: "onboarding",
      status: "active",
    });
  }
}

/**
 * Turn onboarding answers into an execution goal, patterns, and first daily plan.
 */
export async function finalizeOnboarding(
  supabase: SupabaseClient,
  userId: string,
  onStep?: (step: FinalizeStep) => void | Promise<void>
): Promise<{ goalId: string | null; goalsCreated: number }> {
  const emit = async (step: FinalizeStep) => {
    if (onStep) await onStep(step);
  };

  const { data: rows } = await supabase
    .from("onboarding_responses")
    .select("question_id, response_text, response_data")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  const byId = new Map<string, StoredResponse>();
  for (const row of rows || []) {
    byId.set(row.question_id, row as StoredResponse);
  }

  const rawGoal = (byId.get("Q2")?.response_text || "").trim();
  const assessment = assessGoalQuality(rawGoal, {});

  if (!assessment.valid) {
    throw new FinalizeOnboardingError(
      assessment.message ||
        "That goal is too vague to plan from. Add a specific domain or outcome and try again."
    );
  }

  const goalTitle = assessment.title || rawGoal;
  const targetDate = resolveTargetDate(byId.get("Q3"));
  const obstacleKey = String(byId.get("Q4")?.response_data?.selected || "");
  const obstacleLabel = obstacleKey ? resolveObstacleLabel(obstacleKey, byId.get("Q4")) : "";
  const successCriteria = (byId.get("Q7")?.response_text || "").trim();
  const weeklyHours = parseWeeklyHours(byId.get("Q5"));
  const lifeArea = goalTitle ? inferAreaFromText(goalTitle) || "personal" : "personal";

  let goalsCreated = 0;

  const patternMeta = OBSTACLE_PATTERN_MAP[obstacleKey];
  if (patternMeta) {
    // Upsert rather than check-then-insert: the recorder is idempotent per
    // (user, pattern), so re-running finalization cannot duplicate a row.
    await recordPattern(supabase, userId, {
      pattern: patternMeta.pattern,
      source: "onboarding",
      trigger: patternMeta.trigger,
      behavioralImpact: patternMeta.behavioralImpact,
    });
  }

  if (goalTitle || obstacleLabel || successCriteria) {
    await writeOnboardingIdentitySignals(supabase, userId, {
      goalTitle: goalTitle || rawGoal.slice(0, 120) || "Active goal",
      lifeArea,
      obstacleLabel: obstacleLabel || "Not specified",
      successCriteria,
    });
  }

  if (weeklyHours) {
    const { data: existingHours } = await supabase
      .from("identity_signals")
      .select("id")
      .eq("user_id", userId)
      .eq("type", "available_hours")
      .maybeSingle();

    if (!existingHours) {
      await supabase.from("identity_signals").insert({
        user_id: userId,
        type: "available_hours",
        description: weeklyHours.label,
        confidence: 0.9,
        source: "onboarding",
        status: "active",
      });
    }
  }

  await emit("creating_goal");

  let goalId: string | null = null;

  if (goalTitle) {
    const { count } = await supabase
      .from("goals")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("goal_kind", "execution")
      .eq("status", "active");

    if ((count ?? 0) === 0) {
      const { data: created } = await supabase
        .from("goals")
        .insert({
          user_id: userId,
          title: goalTitle,
          success_criteria: successCriteria || null,
          target_date: targetDate,
          life_area: lifeArea,
          goal_kind: "execution",
          category: lifeArea,
          status: "active",
          source: "onboarding",
        })
        .select("id, title")
        .single();

      if (created) {
        goalId = created.id;
        goalsCreated += 1;

        await emit("building_milestones");

        await generateMilestonesForGoal(
          supabase,
          userId,
          created.id,
          created.title,
          [successCriteria, obstacleLabel ? `Obstacle: ${obstacleLabel}` : ""]
            .filter(Boolean)
            .join(". ") || null,
          lifeArea,
          false,
          null,
          obstacleKey
            ? { key: obstacleKey, label: obstacleLabel, notes: byId.get("Q4")?.response_text }
            : undefined
        );

        await supabase
          .from("profiles")
          .update({
            current_focus_goal_id: created.id,
            current_focus_until: targetDate,
          })
          .eq("id", userId);

        if (weeklyHours) {
          await savePlanContextData(
            supabase,
            userId,
            created.id,
            { weeklyAvailableHours: weeklyHours.hours },
            { skipUserModelRefresh: true }
          );
        }

        trackProductEventOnce(userId, "first_initiative_created").catch(() => {});
      }
    }
  } else if (!assessment.valid && rawGoal) {
    await supabase.from("goals").insert({
      user_id: userId,
      title: assessment.title.slice(0, 120),
      category: "personal",
      priority: "medium",
      goal_kind: "execution",
      status: "active",
      source: "onboarding",
      description: "Goal captured — needs sharpening before planning.",
    });
    goalsCreated += 1;
  }

  await cancelLegacyDirectionTasks(supabase, userId);

  if (goalId) {
    await emit("generating_plan");
    try {
      await ensureTodayPlan(supabase, userId);
      invalidateUserCache(userId, "onboarding first plan");
      trackProductEventOnce(userId, "first_plan_generated").catch(() => {});
    } catch (err) {
      console.error("[onboarding] first plan generation:", err);
    }
  }

  await emit("setting_up_coach");
  try {
    await synthesizeUserModel(supabase, userId);
    invalidateUserCache(userId, "onboarding user model");
  } catch (err) {
    console.error("[onboarding] user model synthesis:", err);
  }

  await supabase
    .from("profiles")
    .update({
      onboarding_completed: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  await supabase
    .from("onboarding_progress")
    .update({
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  await emit("done");

  return { goalId, goalsCreated };
}
