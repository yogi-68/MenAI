import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/handler";
import { apiDbError, apiError } from "@/lib/api/errors";
import { RATE_LIMITS } from "@/lib/api/rate-limit";
import { regenerateMilestonesIfAbstract } from "@/lib/plans/milestone-generator";
import { invalidateTodayPlan } from "@/lib/plans/daily-plan-generator";
import { invalidateUserCache } from "@/lib/ai/orchestrator/cache-invalidation";

export const runtime = "nodejs";

const QuerySchema = z.object({
  initiativeId: z.string().uuid().optional(),
});

const PatchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["pending", "in_progress", "completed"]),
});

const PostSchema = z.object({
  initiativeId: z.string().uuid(),
});

export const GET = withAuth(
  { scope: "milestones", query: QuerySchema, rateLimit: RATE_LIMITS.read },
  async ({ user, supabase, query }) => {
    let q = supabase
      .from("goal_milestones")
      .select("id, goal_id, title, description, status, sort_order, target_date, completed_at")
      .eq("user_id", user.id)
      .order("sort_order", { ascending: true });

    if (query.initiativeId) q = q.eq("goal_id", query.initiativeId);

    const { data, error } = await q.limit(200);
    if (error) return apiDbError("milestones", error, { userId: user.id });
    return NextResponse.json({ milestones: data ?? [] });
  }
);

export const PATCH = withAuth(
  { scope: "milestones", body: PatchSchema, rateLimit: RATE_LIMITS.write },
  async ({ user, supabase, body }) => {
    const updates: Record<string, unknown> = { status: body.status };
    if (body.status === "completed") updates.completed_at = new Date().toISOString();

    const { data: milestone, error } = await supabase
      .from("goal_milestones")
      .update(updates)
      .eq("id", body.id)
      .eq("user_id", user.id)
      .select("goal_id")
      .single();

    if (error) return apiDbError("milestones", error, { userId: user.id });

    // Completing one milestone promotes the next pending one, so the goal
    // always has exactly one milestone in progress.
    if (body.status === "completed" && milestone?.goal_id) {
      const { data: next } = await supabase
        .from("goal_milestones")
        .select("id")
        .eq("goal_id", milestone.goal_id)
        .eq("user_id", user.id)
        .eq("status", "pending")
        .order("sort_order", { ascending: true })
        .limit(1);

      if (next?.[0]) {
        await supabase
          .from("goal_milestones")
          .update({ status: "in_progress" })
          .eq("id", next[0].id)
          .eq("user_id", user.id);
      }
    }

    await invalidateTodayPlan(supabase, user.id);
    invalidateUserCache(user.id, "milestone updated");
    return NextResponse.json({ success: true });
  }
);

/** Regenerate abstract milestones into concrete, actionable steps. */
export const POST = withAuth(
  { scope: "milestones", body: PostSchema, rateLimit: RATE_LIMITS.write },
  async ({ user, supabase, body }) => {
    const { data: goal } = await supabase
      .from("goals")
      .select("id, title, description, life_area")
      .eq("id", body.initiativeId)
      .eq("user_id", user.id)
      .eq("goal_kind", "execution")
      .maybeSingle();

    if (!goal) return apiError("not_found", { message: "That goal doesn't exist." });

    const updated = await regenerateMilestonesIfAbstract(
      supabase,
      user.id,
      goal.id,
      goal.title,
      goal.description,
      goal.life_area
    );

    if (!updated) {
      return NextResponse.json({
        regenerated: false,
        message: "Those milestones already look concrete.",
      });
    }

    await invalidateTodayPlan(supabase, user.id);
    invalidateUserCache(user.id, "milestones regenerated");
    return NextResponse.json({ regenerated: true });
  }
);
