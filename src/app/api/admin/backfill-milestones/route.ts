import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";
import { ensureMilestonesForUser } from "@/lib/plans/milestone-generator";
import { invalidateUserCache } from "@/lib/ai/orchestrator/cache-invalidation";

export const runtime = "nodejs";

/**
 * POST /api/admin/backfill-milestones
 * Admin-only: ensure milestones for all active execution goals, optionally force plan regen.
 * Body: { userId?: string, forcePlanRegen?: boolean }
 */
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const body = (await req.json().catch(() => ({}))) as {
    userId?: string;
    forcePlanRegen?: boolean;
  };

  const supabase = await createServerSupabaseClient();
  const targetUserId = body.userId || admin.user.id;

  const { ensured, goalIds } = await ensureMilestonesForUser(supabase, targetUserId);

  let planDeleted = false;
  if (body.forcePlanRegen !== false) {
    const today = new Date().toISOString().split("T")[0];
    const { error } = await supabase
      .from("daily_plans")
      .delete()
      .eq("user_id", targetUserId)
      .eq("plan_date", today);
    planDeleted = !error;
  }

  invalidateUserCache(targetUserId, "admin milestone backfill");

  return NextResponse.json({
    ok: true,
    userId: targetUserId,
    milestonesCreatedFor: ensured,
    goalIds,
    todayPlanDeleted: planDeleted,
  });
}
