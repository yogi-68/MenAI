import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";
import { ensureMilestonesForUser } from "@/lib/plans/milestone-generator";
import { invalidateUserCache } from "@/lib/ai/orchestrator/cache-invalidation";
import { apiError } from "@/lib/api/errors";
import { z } from "zod";

export const runtime = "nodejs";

const BodySchema = z.object({
  /** Target user. Defaults to the calling admin. */
  userId: z.string().uuid().optional(),
  forcePlanRegen: z.boolean().optional(),
});

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

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return apiError("invalid_request", { message: "Expected an optional userId and forcePlanRegen." });
  }
  const body = parsed.data;

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
