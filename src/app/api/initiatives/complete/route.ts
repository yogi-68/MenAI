import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { completeInitiative } from "@/lib/plans/initiative-completion";
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
    const { initiativeId } = body as { initiativeId: string };
    if (!initiativeId) {
      return NextResponse.json({ error: "initiativeId required" }, { status: 400 });
    }

    const result = await completeInitiative(supabase, user.id, initiativeId);
    await invalidateTodayPlan(supabase, user.id);
    invalidateUserCache(user.id, "initiative completed");
    scheduleUserModelRefresh(supabase, user.id);

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to complete initiative";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
