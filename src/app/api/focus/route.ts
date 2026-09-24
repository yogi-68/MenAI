import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/handler";
import { apiError } from "@/lib/api/errors";
import { RATE_LIMITS } from "@/lib/api/rate-limit";
import { invalidateTodayPlan } from "@/lib/plans/daily-plan-generator";
import { invalidateUserCache } from "@/lib/ai/orchestrator/cache-invalidation";
import { scheduleUserModelRefresh } from "@/lib/user-model/synthesis-engine";

export const runtime = "nodejs";

const BodySchema = z.object({
  /** null clears the current focus. */
  initiativeId: z.string().uuid().nullable(),
  until: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
    .optional(),
});

export const GET = withAuth(
  { scope: "focus", rateLimit: RATE_LIMITS.read },
  async ({ user, supabase }) => {
    const { data: profile } = await supabase
      .from("profiles")
      .select("current_focus_goal_id, current_focus_until")
      .eq("id", user.id)
      .single();

    if (!profile?.current_focus_goal_id) return NextResponse.json({ focus: null });

    const { data: goal } = await supabase
      .from("goals")
      .select("id, title, target_date, life_area, status")
      .eq("id", profile.current_focus_goal_id)
      .eq("user_id", user.id)
      .eq("goal_kind", "execution")
      .maybeSingle();

    if (!goal || goal.status !== "active") return NextResponse.json({ focus: null });

    return NextResponse.json({
      focus: {
        initiativeId: goal.id,
        title: goal.title,
        until: profile.current_focus_until || goal.target_date,
        lifeArea: goal.life_area,
      },
    });
  }
);

export const PATCH = withAuth(
  { scope: "focus", body: BodySchema, rateLimit: RATE_LIMITS.write },
  async ({ user, supabase, body }) => {
    if (body.initiativeId === null) {
      await supabase
        .from("profiles")
        .update({ current_focus_goal_id: null, current_focus_until: null })
        .eq("id", user.id);

      await invalidateTodayPlan(supabase, user.id);
      invalidateUserCache(user.id, "current focus cleared");
      scheduleUserModelRefresh(supabase, user.id);
      return NextResponse.json({ success: true, focus: null });
    }

    const { data: goal } = await supabase
      .from("goals")
      .select("id, title, target_date")
      .eq("id", body.initiativeId)
      .eq("user_id", user.id)
      .eq("goal_kind", "execution")
      .eq("status", "active")
      .maybeSingle();

    if (!goal) return apiError("not_found", { message: "That goal isn't active." });

    const focusUntil = body.until || goal.target_date;

    await supabase
      .from("profiles")
      .update({ current_focus_goal_id: goal.id, current_focus_until: focusUntil })
      .eq("id", user.id);

    await invalidateTodayPlan(supabase, user.id);
    invalidateUserCache(user.id, "current focus changed");
    scheduleUserModelRefresh(supabase, user.id);

    return NextResponse.json({
      success: true,
      focus: { initiativeId: goal.id, title: goal.title, until: focusUntil },
    });
  }
);
