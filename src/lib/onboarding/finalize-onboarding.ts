import type { SupabaseClient } from "@supabase/supabase-js";
import { OBSTACLE_PATTERN_MAP } from "@/lib/onboarding/questions";
import { generateMilestonesForGoal } from "@/lib/plans/milestone-generator";
import { cancelLegacyDirectionTasks } from "@/lib/plans/legacy-task-cleanup";
import { ensureTodayPlan } from "@/lib/plans/daily-plan-generator";
import { scheduleUserModelRefresh } from "@/lib/user-model/synthesis-engine";
import { assessGoalQuality } from "@/lib/goals/goal-quality-gate";
import { inferAreaFromText } from "@/lib/plans/life-area-balancer";
import { trackProductEventOnce } from "@/lib/analytics/track-event";

interface StoredResponse {
  question_id: string;
  response_text: string | null;
  response_data: { selected?: string | string[] } | null;
}

function deadlineFromDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function resolveTargetDate(q3: StoredResponse | undefined): string {
  const selected = String(q3?.response_data?.selected || "60");
  if (selected === "custom" && q3?.response_text) {
    return q3.response_text.split("T")[0];
  }
  const days = Number(selected);
  return deadlineFromDays(Number.isFinite(days) ? days : 60);
}

/**
 * Turn onboarding answers into an execution goal, patterns, and first daily plan.
 */
export async function finalizeOnboarding(
  supabase: SupabaseClient,
  userId: string
): Promise<{ goalId: string | null; goalsCreated: number }> {
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
  const goalTitle = assessment.valid && !assessment.needsSharpening ? assessment.title : "";
  const targetDate = resolveTargetDate(byId.get("Q3"));
  const obstacle = String(byId.get("Q4")?.response_data?.selected || "");
  const successCriteria = (byId.get("Q7")?.response_text || "").trim();

  let goalsCreated = 0;

  const patternMeta = OBSTACLE_PATTERN_MAP[obstacle];
  if (patternMeta) {
    const { data: existingPattern } = await supabase
      .from("execution_patterns")
      .select("id")
      .eq("user_id", userId)
      .eq("pattern", patternMeta.pattern)
      .maybeSingle();

    if (!existingPattern) {
      await supabase.from("execution_patterns").insert({
        user_id: userId,
        pattern: patternMeta.pattern,
        trigger: patternMeta.trigger,
        behavioral_impact: patternMeta.behavioralImpact,
        frequency: "occasional",
        severity: "medium",
        confidence: 0.85,
        occurrences: 1,
      });
    }
  }

  await supabase
    .from("profiles")
    .update({
      onboarding_completed: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  let goalId: string | null = null;

  if (goalTitle) {
    const lifeArea = inferAreaFromText(goalTitle) || "personal";

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

        await generateMilestonesForGoal(
          supabase,
          userId,
          created.id,
          created.title,
          successCriteria || null,
          lifeArea,
          false,
          null
        );

        await supabase
          .from("profiles")
          .update({
            current_focus_goal_id: created.id,
            current_focus_until: targetDate,
          })
          .eq("id", userId);

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
    try {
      await ensureTodayPlan(supabase, userId);
      trackProductEventOnce(userId, "first_plan_generated").catch(() => {});
    } catch (err) {
      console.error("[onboarding] first plan generation:", err);
    }
  }

  scheduleUserModelRefresh(supabase, userId);

  return { goalId, goalsCreated };
}
