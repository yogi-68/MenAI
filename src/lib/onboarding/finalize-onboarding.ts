import type { SupabaseClient } from "@supabase/supabase-js";
import {
  COACHING_STYLE_MAP,
  DIRECTION_AREA_MAP,
  OBSTACLE_PATTERN_MAP,
} from "@/lib/onboarding/questions";
import { generateMilestonesForInitiative } from "@/lib/plans/milestone-generator";
import { cancelLegacyDirectionTasks } from "@/lib/plans/legacy-task-cleanup";
import { ensureTodayPlan } from "@/lib/plans/daily-plan-generator";
import { scheduleUserModelRefresh } from "@/lib/user-model/synthesis-engine";
import { normalizeInitiativeTitle } from "@/lib/initiatives/title-quality";
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

function reflectionFrequency(value: string | undefined): string {
  switch (value) {
    case "morning":
    case "morning_night":
    case "full_day":
      return "daily";
    case "on_open":
      return "as_needed";
    default:
      return "daily";
  }
}

function primaryLifeArea(selected: string[]): string {
  for (const key of selected) {
    const mapped = DIRECTION_AREA_MAP[key];
    if (mapped) return mapped.lifeArea;
  }
  return "personal";
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
 * Turn onboarding answers into direction, initiative, patterns, and first daily plan.
 */
export async function finalizeOnboarding(
  supabase: SupabaseClient,
  userId: string
): Promise<{ initiativeId: string | null; goalsCreated: number }> {
  const { data: rows } = await supabase
    .from("onboarding_responses")
    .select("question_id, response_text, response_data")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  const byId = new Map<string, StoredResponse>();
  for (const row of rows || []) {
    byId.set(row.question_id, row as StoredResponse);
  }

  const q1 = byId.get("Q1")?.response_data?.selected;
  const directionAreas = Array.isArray(q1) ? q1 : q1 ? [q1] : [];
  const buildingWhat = (byId.get("Q1B")?.response_text || "").trim();
  const initiativeTitle = normalizeInitiativeTitle(
    (byId.get("Q2")?.response_text || "").trim()
  );
  const targetDate = resolveTargetDate(byId.get("Q3"));
  const obstacle = String(byId.get("Q4")?.response_data?.selected || "");
  const coachingStyle = String(byId.get("Q5")?.response_data?.selected || "balanced");
  const checkIn = String(byId.get("Q6")?.response_data?.selected || "morning_night");
  const successCriteria = (byId.get("Q7")?.response_text || "").trim();

  let goalsCreated = 0;
  const existingGoals = await supabase
    .from("goals")
    .select("title")
    .eq("user_id", userId)
    .eq("status", "active");

  const existingTitles = new Set(
    (existingGoals.data || []).map((g) => g.title.toLowerCase())
  );

  for (const area of directionAreas) {
    const mapped = DIRECTION_AREA_MAP[area];
    if (!mapped || existingTitles.has(mapped.label.toLowerCase())) continue;
    await supabase.from("goals").insert({
      user_id: userId,
      title: mapped.label,
      category: mapped.goalCategory,
      priority: "high",
      status: "active",
      source: "onboarding",
    });
    existingTitles.add(mapped.label.toLowerCase());
    goalsCreated += 1;

    await supabase.from("identity_signals").insert({
      user_id: userId,
      type: "direction",
      description: mapped.label,
      long_term_direction: mapped.label,
      confidence: 0.9,
      source: "onboarding",
    });
  }

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

  const profileUpdate: Record<string, unknown> = {
    coaching_style: COACHING_STYLE_MAP[coachingStyle] || "balanced",
    reflection_frequency: reflectionFrequency(checkIn),
    onboarding_completed: true,
    updated_at: new Date().toISOString(),
  };

  if (buildingWhat) {
    profileUpdate.vision = `Building: ${buildingWhat}`;
  }

  await supabase.from("profiles").update(profileUpdate).eq("id", userId);

  let initiativeId: string | null = null;

  if (initiativeTitle) {
    const lifeArea = primaryLifeArea(directionAreas);
    const description = buildingWhat ? `Building ${buildingWhat}` : null;

    const { count } = await supabase
      .from("initiatives")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "active");

    if ((count ?? 0) === 0) {
      const { data: created } = await supabase
        .from("initiatives")
        .insert({
          user_id: userId,
          title: initiativeTitle,
          description,
          success_criteria: successCriteria || null,
          target_date: targetDate,
          life_area: lifeArea,
          status: "active",
        })
        .select("id, title")
        .single();

      if (created) {
        initiativeId = created.id;
        await generateMilestonesForInitiative(
          supabase,
          userId,
          created.id,
          created.title,
          successCriteria || description,
          lifeArea
        );

        await supabase
          .from("profiles")
          .update({
            current_focus_initiative_id: created.id,
            current_focus_until: targetDate,
          })
          .eq("id", userId);

        trackProductEventOnce(userId, "first_initiative_created").catch(() => {});
      }
    }
  }

  await cancelLegacyDirectionTasks(supabase, userId);

  if (initiativeId) {
    try {
      await ensureTodayPlan(supabase, userId);
      trackProductEventOnce(userId, "first_plan_generated").catch(() => {});
    } catch (err) {
      console.error("[onboarding] first plan generation:", err);
    }
  }

  scheduleUserModelRefresh(supabase, userId);

  return { initiativeId, goalsCreated };
}
