import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchAndComputeGoalConfidence } from "@/lib/plans/goal-confidence";

export const runtime = "nodejs";

/** GET /api/analytics/confidence?goalId=X — fresh confidence breakdown for a single goal */
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const goalId = new URL(req.url).searchParams.get("goalId");
  if (!goalId) return NextResponse.json({ error: "goalId required" }, { status: 400 });

  const { data: goal } = await supabase
    .from("goals")
    .select("id, title, target_date, success_criteria")
    .eq("id", goalId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!goal) return NextResponse.json({ error: "Goal not found" }, { status: 404 });

  const breakdown = await fetchAndComputeGoalConfidence(supabase, user.id, goalId, {
    target_date: goal.target_date,
    success_criteria: goal.success_criteria,
  });

  return NextResponse.json({ goalId, title: goal.title, confidence: breakdown });
}
