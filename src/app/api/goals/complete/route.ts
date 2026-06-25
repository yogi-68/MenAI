import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { completeGoal } from "@/lib/plans/goal-completion";
import { invalidateTodayPlan } from "@/lib/plans/daily-plan-generator";
import { invalidateUserCache } from "@/lib/ai/orchestrator/cache-invalidation";
import { scheduleUserModelRefresh } from "@/lib/user-model/synthesis-engine";

export const runtime = "nodejs";
export const maxDuration = 45;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { goalId, initiativeId } = body as { goalId?: string; initiativeId?: string };
    const resolvedGoalId = goalId || initiativeId;
    if (!resolvedGoalId) {
      return NextResponse.json({ error: "goalId required" }, { status: 400 });
    }

    const result = await completeGoal(supabase, user.id, resolvedGoalId);
    await invalidateTodayPlan(supabase, user.id);
    invalidateUserCache(user.id, "goal completed");
    scheduleUserModelRefresh(supabase, user.id);

    return NextResponse.json({
      success: true,
      ...result,
      initiativeTitle: result.goalTitle,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to complete goal";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
