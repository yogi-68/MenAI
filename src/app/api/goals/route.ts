import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/handler";
import { apiDbError, apiError } from "@/lib/api/errors";
import { RATE_LIMITS } from "@/lib/api/rate-limit";
import { invalidateUserCache } from "@/lib/ai/orchestrator/cache-invalidation";
import { scheduleUserModelRefresh } from "@/lib/user-model/synthesis-engine";
import { invalidateTodayPlan } from "@/lib/plans/daily-plan-generator";
import { trackProductEventOnce } from "@/lib/analytics/track-event";
import { assertCanActivateGoal } from "@/lib/ai/memory-confidence";
import { MAX_ACTIVE_GOALS } from "@/lib/product/constants";
import { assessGoalQuality } from "@/lib/goals/goal-quality-gate";
import { generateMilestonesForGoal, ensureMilestonesForGoal } from "@/lib/plans/milestone-generator";
import { fetchActiveExecutionGoals } from "@/lib/goals/active-goals";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const GoalKind = z.enum(["execution", "direction"]);
const Priority = z.enum(["low", "medium", "high"]);
const Status = z.enum(["active", "paused", "completed", "archived"]);

const QuerySchema = z.object({
  status: z.union([Status, z.literal("all")]).optional(),
  category: z.string().trim().max(60).optional(),
  goal_kind: GoalKind.optional(),
  id: z.string().uuid().optional(),
});

const CreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  category: z.string().trim().max(60).optional(),
  priority: Priority.optional(),
  targetDate: DateString.nullable().optional(),
  parentGoalId: z.string().uuid().nullable().optional(),
  goalId: z.string().uuid().nullable().optional(),
  lifeArea: z.string().trim().max(60).optional(),
  goalKind: GoalKind.optional(),
});

const UpdateSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    targetDate: DateString.nullable().optional(),
    lifeArea: z.string().trim().max(60).optional(),
    status: Status.optional(),
    progress: z.number().min(0).max(100).optional(),
    category: z.string().trim().max(60).optional(),
    priority: Priority.optional(),
    parentGoalId: z.string().uuid().nullable().optional(),
    goalId: z.string().uuid().nullable().optional(),
    goalStage: z.string().trim().max(40).optional(),
    initiativeStage: z.string().trim().max(40).optional(),
  })
  .refine((v) => Object.keys(v).length > 1, { message: "Nothing to update." });

const EXECUTION_SELECT =
  "*, parent_goal:parent_goal_id(title, category), goal_milestones(id, title, sort_order, status)";

/** Goals drive the daily plan, so any change invalidates today's. */
async function invalidatePlanFor(supabase: SupabaseClient, userId: string) {
  await invalidateTodayPlan(supabase, userId);
  invalidateUserCache(userId, "goal changed");
}

/**
 * An execution goal is one with a deadline. The client may say so explicitly;
 * otherwise a target date and no category implies it.
 */
function isExecutionRequest(body: z.infer<typeof CreateSchema>): boolean {
  if (body.goalKind === "execution") return true;
  if (body.goalKind === "direction") return false;
  return Boolean(body.targetDate && !body.category);
}

export const GET = withAuth(
  { scope: "goals", query: QuerySchema, rateLimit: RATE_LIMITS.read },
  async ({ user, supabase, query }) => {
    const status = query.status ?? "active";
    const goalKind = query.goal_kind;

    let q =
      goalKind === "execution"
        ? supabase
            .from("goals")
            .select(EXECUTION_SELECT)
            .eq("user_id", user.id)
            .eq("goal_kind", "execution")
            .order("target_date", { ascending: true, nullsFirst: false })
        : supabase
            .from("goals")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false });

    if (goalKind === "direction") q = q.eq("goal_kind", "direction");
    if (status !== "all") q = q.eq("status", status);
    if (query.category) q = q.eq("category", query.category);

    const { data, error } = await q.limit(50);

    // The execution select joins two tables that may not exist on an
    // un-migrated database; fall back to the plain read rather than failing.
    if (error && goalKind !== "execution") {
      return apiDbError("goals", error, { userId: user.id });
    }

    let goals = data ?? [];
    if (goalKind === "execution" && (error || goals.length === 0)) {
      goals = (await fetchActiveExecutionGoals(supabase, user.id, 50)) as typeof goals;
    } else if (error) {
      return apiDbError("goals", error, { userId: user.id });
    }

    const executionGoals = goals.filter(
      (g) =>
        (g as { goal_kind?: string }).goal_kind === "execution" ||
        (g as { target_date?: string }).target_date
    );

    return NextResponse.json({
      goals,
      ...(goalKind === "execution" || executionGoals.length > 0
        ? { initiatives: goalKind === "execution" ? goals : executionGoals }
        : {}),
    });
  }
);

export const POST = withAuth(
  { scope: "goals", body: CreateSchema, rateLimit: RATE_LIMITS.write },
  async ({ user, supabase, body }) => {
    if (isExecutionRequest(body)) {
      const titleCheck = assessGoalQuality(body.title);

      if (!titleCheck.valid) {
        return NextResponse.json(
          {
            error: titleCheck.message,
            code: "invalid_request",
            kind: titleCheck.kind,
            suggestions: titleCheck.suggestions,
          },
          { status: 400 }
        );
      }

      // 422 rather than 400: the goal is understood, it just needs sharpening,
      // and the client renders the options rather than treating it as invalid.
      if (titleCheck.needsSharpening) {
        return NextResponse.json(
          {
            error: titleCheck.message,
            code: "invalid_request",
            needsSharpening: true,
            sharpenPrompt: titleCheck.sharpenPrompt,
            sharpenOptions: titleCheck.sharpenOptions,
          },
          { status: 422 }
        );
      }

      if (!body.targetDate) {
        return apiError("invalid_request", {
          message: "An execution goal needs a deadline — planning depends on it.",
        });
      }

      const gate = await assertCanActivateGoal(supabase, user.id);
      if (!gate.ok) return apiError("conflict", { message: gate.error });

      const lifeArea = body.lifeArea || "personal";
      const { data, error } = await supabase
        .from("goals")
        .insert({
          user_id: user.id,
          title: titleCheck.title,
          description: body.description?.trim() || null,
          target_date: body.targetDate,
          life_area: lifeArea,
          parent_goal_id: body.parentGoalId || body.goalId || null,
          goal_kind: "execution",
          category: body.category || lifeArea,
          priority: body.priority || "medium",
          status: "active",
        })
        .select(EXECUTION_SELECT)
        .single();

      if (error) return apiDbError("goals", error, { userId: user.id });

      await generateMilestonesForGoal(
        supabase,
        user.id,
        data.id,
        data.title,
        data.description,
        data.life_area || "personal"
      );

      await invalidatePlanFor(supabase, user.id);
      scheduleUserModelRefresh(supabase, user.id);
      trackProductEventOnce(user.id, "first_initiative_created").catch(() => {});

      return NextResponse.json({ goal: data, initiative: data }, { status: 201 });
    }

    if (!body.category) {
      return apiError("invalid_request", {
        message: "A direction goal needs a category.",
      });
    }

    const { data, error } = await supabase
      .from("goals")
      .insert({
        user_id: user.id,
        title: body.title,
        description: body.description || null,
        category: body.category,
        priority: body.priority || "medium",
        target_date: body.targetDate || null,
        goal_kind: body.goalKind === "execution" ? "execution" : "direction",
      })
      .select()
      .single();

    if (error) return apiDbError("goals", error, { userId: user.id });

    if (data.goal_kind === "execution") {
      await ensureMilestonesForGoal(supabase, user.id, data.id);
    }

    invalidateUserCache(user.id, "goal created");
    scheduleUserModelRefresh(supabase, user.id);

    return NextResponse.json({ goal: data }, { status: 201 });
  }
);

export const PATCH = withAuth(
  { scope: "goals", body: UpdateSchema, rateLimit: RATE_LIMITS.write },
  async ({ user, supabase, body }) => {
    const { data: existing } = await supabase
      .from("goals")
      .select("goal_kind, status")
      .eq("id", body.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!existing) return apiError("not_found", { message: "That goal doesn't exist." });

    const isExecution = existing.goal_kind === "execution";
    const mapped: Record<string, unknown> = {};

    if (body.title !== undefined) {
      if (isExecution) {
        const titleCheck = assessGoalQuality(body.title);
        if (!titleCheck.valid) {
          return NextResponse.json(
            {
              error: titleCheck.message,
              code: "invalid_request",
              suggestions: titleCheck.suggestions,
            },
            { status: 400 }
          );
        }
        if (titleCheck.needsSharpening) {
          return NextResponse.json(
            {
              error: titleCheck.message,
              code: "invalid_request",
              needsSharpening: true,
              sharpenPrompt: titleCheck.sharpenPrompt,
              sharpenOptions: titleCheck.sharpenOptions,
            },
            { status: 422 }
          );
        }
        mapped.title = titleCheck.title;
      } else {
        mapped.title = body.title;
      }
    }

    if (body.description !== undefined) mapped.description = body.description;
    if (body.targetDate !== undefined) mapped.target_date = body.targetDate;
    if (body.lifeArea !== undefined) mapped.life_area = body.lifeArea;
    if (body.status !== undefined) mapped.status = body.status;
    if (body.progress !== undefined) mapped.progress = body.progress;
    if (body.category !== undefined) mapped.category = body.category;
    if (body.priority !== undefined) mapped.priority = body.priority;
    if (body.parentGoalId !== undefined || body.goalId !== undefined) {
      mapped.parent_goal_id = body.parentGoalId ?? body.goalId ?? null;
    }
    if (body.goalStage !== undefined || body.initiativeStage !== undefined) {
      mapped.goal_stage = body.goalStage ?? body.initiativeStage;
    }

    // Re-activating counts against the active-goal ceiling.
    if (body.status === "active" && isExecution && existing.status !== "active") {
      const gate = await assertCanActivateGoal(supabase, user.id);
      if (!gate.ok) {
        return NextResponse.json(
          { error: gate.error, code: "conflict", maxActive: MAX_ACTIVE_GOALS },
          { status: 409 }
        );
      }
    }

    const { data, error } = await supabase
      .from("goals")
      .update(mapped)
      .eq("id", body.id)
      .eq("user_id", user.id)
      .select(isExecution ? EXECUTION_SELECT : "*")
      .single();

    if (error) return apiDbError("goals", error, { userId: user.id });

    if (isExecution) await invalidatePlanFor(supabase, user.id);
    else invalidateUserCache(user.id, "goal updated");

    scheduleUserModelRefresh(supabase, user.id);

    return NextResponse.json(isExecution ? { goal: data, initiative: data } : { goal: data });
  }
);

export const DELETE = withAuth(
  { scope: "goals", query: QuerySchema.required({ id: true }), rateLimit: RATE_LIMITS.write },
  async ({ user, supabase, query }) => {
    const { data: existing } = await supabase
      .from("goals")
      .select("goal_kind")
      .eq("id", query.id)
      .eq("user_id", user.id)
      .maybeSingle();

    const { error } = await supabase
      .from("goals")
      .delete()
      .eq("id", query.id)
      .eq("user_id", user.id);

    if (error) return apiDbError("goals", error, { userId: user.id });

    if (existing?.goal_kind === "execution") await invalidatePlanFor(supabase, user.id);
    else invalidateUserCache(user.id, "goal deleted");

    scheduleUserModelRefresh(supabase, user.id);
    return NextResponse.json({ success: true });
  }
);
