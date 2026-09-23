/**
 * POST /api/confidence/answer
 * Handles user responses to confidence Q&A questions.
 * Writes data to DB, recomputes confidence, returns next question.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  fetchAndComputeGoalConfidence,
  type GoalConfidenceBreakdown,
} from "@/lib/plans/goal-confidence";
import { ensureMilestonesForGoal } from "@/lib/plans/milestone-generator";
import { invalidateUserCache } from "@/lib/ai/orchestrator/cache-invalidation";

export const runtime = "nodejs";

/** Convert preset option values to actual dates */
const PRESET_DAYS: Record<string, number> = {
  "90_days": 90,
  "180_days": 180,
  "365_days": 365,
  "900_days": 900,
};

/** Ordered sequence of factors that can be improved */
const FACTOR_ORDER = ["deadline", "success", "obstacle", "resources"] as const;
type Factor = (typeof FACTOR_ORDER)[number];

function presetToISODate(value: string): string | null {
  const days = PRESET_DAYS[value];
  if (days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split("T")[0];
  }
  // Try parsing a custom date string
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed.toISOString().split("T")[0];
}

function getNextUnansweredFactor(
  breakdown: GoalConfidenceBreakdown,
  justAnswered: Factor
): Factor | null {
  const answered = new Set(breakdown.answeredFactors ?? []);
  answered.add(justAnswered);
  for (const factor of FACTOR_ORDER) {
    if (factor === justAnswered) continue;
    if (answered.has(factor)) continue;
    // Only suggest factors with non-zero potential gain
    if (breakdown[factor] < 20) return factor;
  }
  return null;
}

function buildConfirmMessage(factor: Factor, _value: string): string {
  switch (factor) {
    case "deadline":
      return `Got it — I've locked in your deadline. Your plan now has a clear finish line.`;
    case "success":
      return `Noted — your success criteria is saved. I'll use this to sharpen daily tasks.`;
    case "obstacle":
      return `Understood — obstacle captured. I'll build mitigation into your plan.`;
    case "resources":
      return `Saved — resource context noted. This helps me calibrate the effort I suggest.`;
    default:
      return `Got it — answer saved.`;
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { goalId?: string; factor?: string; value?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { goalId, factor, value } = body;
  if (!goalId || !factor || value === undefined || value === null) {
    return NextResponse.json({ error: "goalId, factor, and value are required" }, { status: 400 });
  }

  if (!FACTOR_ORDER.includes(factor as Factor)) {
    return NextResponse.json({ error: `Unknown factor: ${factor}` }, { status: 400 });
  }

  // Fetch the current goal
  const { data: goal } = await supabase
    .from("goals")
    .select("id, title, target_date, success_criteria, user_id")
    .eq("id", goalId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!goal) return NextResponse.json({ error: "Goal not found" }, { status: 404 });

  // Write value to the appropriate table
  const typedFactor = factor as Factor;

  if (typedFactor === "deadline") {
    const isoDate = presetToISODate(value);
    if (!isoDate) {
      return NextResponse.json({ error: "Could not parse date from value" }, { status: 400 });
    }
    await supabase
      .from("goals")
      .update({ target_date: isoDate })
      .eq("id", goalId);

    // Regenerate milestones with the new deadline
    await supabase.from("goal_milestones").delete().eq("goal_id", goalId);
    ensureMilestonesForGoal(supabase, user.id, goalId).catch(() => {});
  } else if (typedFactor === "success") {
    await supabase
      .from("goals")
      .update({ success_criteria: value })
      .eq("id", goalId);
  } else if (typedFactor === "obstacle") {
    // Upsert an execution_patterns row for this obstacle
    await supabase.from("execution_patterns").upsert(
      {
        user_id: user.id,
        pattern: value,
        behavioral_impact: value,
        status: "active",
        source: "confidence_qa",
      },
      { onConflict: "user_id,pattern" }
    );
  } else if (typedFactor === "resources") {
    // Upsert an identity_signals row for available hours / resources
    await supabase.from("identity_signals").upsert(
      {
        user_id: user.id,
        type: "available_hours",
        description: value,
        status: "active",
        source: "confidence_qa",
      },
      { onConflict: "user_id,type" }
    );
  }

  // Fetch updated goal row for recompute
  const { data: updatedGoal } = await supabase
    .from("goals")
    .select("target_date, success_criteria")
    .eq("id", goalId)
    .maybeSingle();

  // Recompute confidence
  const breakdown = await fetchAndComputeGoalConfidence(supabase, user.id, goalId, {
    target_date: updatedGoal?.target_date ?? goal.target_date,
    success_criteria: updatedGoal?.success_criteria ?? goal.success_criteria,
  });

  // Mark factor as answered in profiles.user_model.goalConfidence[goalId].answeredFactors
  const { data: profileData } = await supabase
    .from("profiles")
    .select("user_model")
    .eq("id", user.id)
    .maybeSingle();

  if (profileData?.user_model) {
    const userModel = profileData.user_model as { goalConfidence?: Record<string, GoalConfidenceBreakdown> };
    const existing = userModel.goalConfidence?.[goalId];
    const updatedBreakdown: GoalConfidenceBreakdown = {
      ...breakdown,
      answeredFactors: [...(existing?.answeredFactors ?? []), typedFactor],
    };
    const updatedGoalConfidence = {
      ...(userModel.goalConfidence ?? {}),
      [goalId]: updatedBreakdown,
    };
    await supabase
      .from("profiles")
      .update({ user_model: { ...userModel, goalConfidence: updatedGoalConfidence } })
      .eq("id", user.id);

    breakdown.answeredFactors = updatedBreakdown.answeredFactors;
  }

  // Invalidate user cache
  invalidateUserCache(user.id, `confidence Q&A: ${factor}`);

  const nextFactor = getNextUnansweredFactor(breakdown, typedFactor);
  const confirmMessage = buildConfirmMessage(typedFactor, value);

  return NextResponse.json({
    newScore: breakdown.total,
    nextFactor,
    confirmMessage,
    breakdown,
  });
}
