import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/handler";
import { apiDbError, apiError } from "@/lib/api/errors";
import { RATE_LIMITS } from "@/lib/api/rate-limit";
import { assertCanActivateGoal } from "@/lib/ai/memory-confidence";
import { invalidateTodayPlan } from "@/lib/plans/daily-plan-generator";
import { invalidateUserCache } from "@/lib/ai/orchestrator/cache-invalidation";
import { generateMilestonesForGoal } from "@/lib/plans/milestone-generator";
import { trackProductEvent } from "@/lib/analytics/track-event";
import { scheduleUserModelRefresh } from "@/lib/user-model/synthesis-engine";

export const runtime = "nodejs";

const BodySchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["accept", "dismiss"]),
  edits: z
    .object({
      title: z.string().trim().min(1).max(200).optional(),
      targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      lifeArea: z.string().trim().max(60).optional(),
    })
    .optional(),
});

function defaultDeadline(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

export const GET = withAuth(
  { scope: "suggestions", rateLimit: RATE_LIMITS.read },
  async ({ user, supabase }) => {
    const { data, error } = await supabase
      .from("ai_suggestions")
      .select("id, suggestion_type, title, payload, status, created_at")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) return apiDbError("suggestions", error, { userId: user.id });
    return NextResponse.json({ suggestions: data || [] });
  }
);

export const POST = withAuth(
  { scope: "suggestions", body: BodySchema, rateLimit: RATE_LIMITS.write },
  async ({ user, supabase, body }) => {
    const { id, action, edits } = body;

    const { data: suggestion } = await supabase
      .from("ai_suggestions")
      .select("id, suggestion_type, title, payload")
      .eq("id", id)
      .eq("user_id", user.id)
      .eq("status", "pending")
      .maybeSingle();

    if (!suggestion) return apiError("not_found", { message: "That suggestion is no longer open." });

    if (action === "dismiss") {
      await supabase
        .from("ai_suggestions")
        .update({ status: "dismissed", resolved_at: new Date().toISOString() })
        .eq("id", id);

      trackProductEvent(user.id, "suggestion_dismissed", {
        type: suggestion.suggestion_type,
        title: suggestion.title,
      }).catch(() => {});
      scheduleUserModelRefresh(supabase, user.id);
      return NextResponse.json({ success: true });
    }

    const payload = (suggestion.payload ?? {}) as Record<string, string>;
    const title = (edits?.title || suggestion.title).trim();
    const lifeArea = edits?.lifeArea || payload.lifeArea || "personal";

    if (suggestion.suggestion_type === "initiative") {
      const gate = await assertCanActivateGoal(supabase, user.id);
      if (!gate.ok) return apiError("conflict", { message: gate.error });

      const { data: created, error } = await supabase
        .from("goals")
        .insert({
          user_id: user.id,
          title,
          description: payload.description || null,
          target_date: edits?.targetDate || payload.targetDate || defaultDeadline(30),
          life_area: lifeArea,
          goal_kind: "execution",
          category: lifeArea,
          status: "active",
        })
        .select("id, title, description, life_area")
        .single();

      if (error) return apiDbError("suggestions", error, { userId: user.id });

      if (created) {
        await generateMilestonesForGoal(
          supabase,
          user.id,
          created.id,
          created.title,
          created.description,
          lifeArea
        );
      }
      await invalidateTodayPlan(supabase, user.id);
      invalidateUserCache(user.id, "goal accepted from suggestion");
    }

    if (suggestion.suggestion_type === "opportunity") {
      const { error } = await supabase.from("opportunities").insert({
        user_id: user.id,
        title,
        description: payload.description || null,
        due_date: edits?.targetDate || payload.dueDate || null,
        urgency: payload.urgency || "medium",
        life_area: lifeArea,
        status: "active",
      });
      if (error) return apiDbError("suggestions", error, { userId: user.id });
    }

    if (suggestion.suggestion_type === "direction") {
      const { error } = await supabase.from("goals").insert({
        user_id: user.id,
        title,
        description: payload.description || null,
        category: payload.category || "personal",
        priority: payload.priority || "medium",
        goal_kind: "direction",
        source: "chat_suggestion",
      });
      if (error) return apiDbError("suggestions", error, { userId: user.id });
    }

    await supabase
      .from("ai_suggestions")
      .update({ status: "accepted", resolved_at: new Date().toISOString() })
      .eq("id", id);

    trackProductEvent(user.id, "suggestion_accepted", {
      type: suggestion.suggestion_type,
      title: suggestion.title,
    }).catch(() => {});
    scheduleUserModelRefresh(supabase, user.id);

    return NextResponse.json({ success: true });
  }
);
