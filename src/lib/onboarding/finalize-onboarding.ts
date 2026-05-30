import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DIRECTION_AREA_MAP,
  OBSTACLE_PATTERN_MAP,
} from "@/lib/onboarding/questions";
import { generateMilestonesForInitiative } from "@/lib/plans/milestone-generator";
import { cancelLegacyDirectionTasks } from "@/lib/plans/legacy-task-cleanup";
import { ensureTodayPlan } from "@/lib/plans/daily-plan-generator";
import { scheduleUserModelRefresh } from "@/lib/user-model/synthesis-engine";
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

function parseDirectionLines(text: string | null): string[] {
  if (!text?.trim()) return [];
  return text
    .split(/[\n·•,;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

function reflectionFrequency(value: string | undefined): string {
  switch (value) {
    case "morning_night":
      return "daily";
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
  const q2Lines = parseDirectionLines(byId.get("Q2")?.response_text || null);
  const initiativeTitle = (byId.get("Q3")?.response_text || "").trim();
  const deadlineDays = Number(byId.get("Q4")?.response_data?.selected || "60");
  const obstacle = String(byId.get("Q5")?.response_data?.selected || "");
  const planningStyle = String(byId.get("Q6")?.response_data?.selected || "balanced");
  const checkIn = String(byId.get("Q7")?.response_data?.selected || "morning_night");

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

  for (const line of q2Lines) {
    if (existingTitles.has(line.toLowerCase())) continue;
    await supabase.from("goals").insert({
      user_id: userId,
      title: line,
      category: "personal",
      priority: "medium",
      status: "active",
      source: "onboarding",
    });
    existingTitles.add(line.toLowerCase());
    goalsCreated += 1;
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

  await supabase
    .from("profiles")
    .update({
      work_style: planningStyle,
      reflection_frequency: reflectionFrequency(checkIn),
      onboarding_completed: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  let initiativeId: string | null = null;

  if (initiativeTitle) {
    const targetDate = deadlineFromDays(Number.isFinite(deadlineDays) ? deadlineDays : 60);
    const lifeArea = primaryLifeArea(directionAreas);

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
          description: null,
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
          null,
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
