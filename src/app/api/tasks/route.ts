import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/handler";
import { apiDbError, apiError } from "@/lib/api/errors";
import { RATE_LIMITS } from "@/lib/api/rate-limit";
import { invalidateUserCache } from "@/lib/ai/orchestrator/cache-invalidation";
import { upsertGoalProgressSnapshotForGoal } from "@/lib/plans/goal-progress-snapshots";
import { scheduleUserModelRefresh } from "@/lib/user-model/synthesis-engine";
import { finishableTaskError } from "@/lib/tasks/finishable-today";
import { TASKS_PER_GOAL } from "@/lib/plans/performance-score";
import { trackProductEventOnce, trackProductEvent } from "@/lib/analytics/track-event";
import { buildCognitiveState } from "@/lib/ai/orchestrator/cognition-engine";
import { autoEvolveAndApply } from "@/lib/ai/orchestrator/task-evolution-engine";
import { cancelLegacyDirectionTasks } from "@/lib/plans/legacy-task-cleanup";
import { isLegacyGenericTask } from "@/lib/dashboard/pending-tasks";
import { logger } from "@/lib/observability/logger";

export const runtime = "nodejs";

const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const TaskStatus = z.enum([
  "pending",
  "in_progress",
  "completed",
  "skipped",
  "missed",
  "cancelled",
]);
const Recurrence = z.enum(["daily", "weekly", "weekdays"]);

const QuerySchema = z.object({
  status: z.union([TaskStatus, z.literal("all")]).optional(),
  goalId: z.string().uuid().optional(),
  dueDate: z.enum(["today", "overdue", "week"]).optional(),
  id: z.string().uuid().optional(),
});

const CreateSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(2000).nullable().optional(),
  goalId: z.string().uuid().nullable().optional(),
  initiativeId: z.string().uuid().nullable().optional(),
  dueDate: z.union([DateString, z.literal("today")]).nullable().optional(),
  scheduledTime: z.string().max(20).nullable().optional(),
  recurrence: Recurrence.nullable().optional(),
  estimatedMinutes: z.number().int().min(1).max(1440).nullable().optional(),
});

/**
 * Updatable fields, enumerated deliberately.
 *
 * The previous handler did `const { id, ...updates } = body` and handed
 * `updates` straight to .update(), so a caller could write any column on their
 * own row — including user_id, streak_count or auto_generated.
 */
const UpdateSchema = z
  .object({
    id: z.string().uuid(),
    status: TaskStatus.optional(),
    title: z.string().trim().min(1).max(300).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    dueDate: DateString.nullable().optional(),
    scheduledTime: z.string().max(20).nullable().optional(),
    estimatedMinutes: z.number().int().min(1).max(1440).nullable().optional(),
    actualMinutes: z.number().int().min(0).max(1440).optional(),
  })
  .refine((v) => Object.keys(v).length > 1, { message: "Nothing to update." });

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function nextDueDate(recurrence: string): string {
  const d = new Date();
  switch (recurrence) {
    case "daily":
      d.setDate(d.getDate() + 1);
      break;
    case "weekly":
      d.setDate(d.getDate() + 7);
      break;
    case "weekdays":
      do {
        d.setDate(d.getDate() + 1);
      } while (d.getDay() === 0 || d.getDay() === 6);
      break;
  }
  return d.toISOString().split("T")[0];
}

export const GET = withAuth(
  { scope: "tasks", query: QuerySchema, rateLimit: RATE_LIMITS.read },
  async ({ user, supabase, query, log }) => {
    await cancelLegacyDirectionTasks(supabase, user.id).catch(() => {});

    let q = supabase
      .from("tasks")
      .select(
        "id, title, description, status, due_date, goal_id, scheduled_time, recurrence, estimated_minutes, actual_minutes, auto_generated, completed_at, created_at, streak_count"
      )
      .eq("user_id", user.id)
      .order("due_date", { ascending: true, nullsFirst: false });

    if (query.status && query.status !== "all") q = q.eq("status", query.status);
    else if (!query.status) q = q.in("status", ["pending", "in_progress"]);

    if (query.goalId) q = q.eq("goal_id", query.goalId);

    if (query.dueDate === "today") {
      q = q.eq("due_date", todayStr());
    } else if (query.dueDate === "overdue") {
      q = q.lt("due_date", todayStr()).in("status", ["pending", "in_progress"]);
    } else if (query.dueDate === "week") {
      const weekLater = new Date(Date.now() + 7 * 86400000);
      q = q.gte("due_date", todayStr()).lte("due_date", weekLater.toISOString().split("T")[0]);
    }

    const { data, error } = await q.limit(50);
    if (error) return apiDbError("tasks", error, { userId: user.id });

    const tasks = (data ?? []).filter((t) => !isLegacyGenericTask(t.title || ""));

    // Task evolution is expensive; skip it on the hot today/list fetches.
    const skipEvolution = query.dueDate === "today" || query.status === "all";
    if (!skipEvolution && query.status !== "completed") {
      buildCognitiveState(user.id)
        .then((state) => autoEvolveAndApply(user.id, state))
        .catch((err) => log.error("task evolution trigger failed", err));
    }

    return NextResponse.json({ tasks });
  }
);

export const POST = withAuth(
  { scope: "tasks", body: CreateSchema, rateLimit: RATE_LIMITS.write },
  async ({ user, supabase, body }) => {
    const linkedGoalId = body.goalId || body.initiativeId || null;

    if (linkedGoalId) {
      const { data: goal } = await supabase
        .from("goals")
        .select("id")
        .eq("id", linkedGoalId)
        .eq("user_id", user.id)
        .eq("goal_kind", "execution")
        .eq("status", "active")
        .maybeSingle();

      if (!goal) {
        return apiError("invalid_request", {
          message: "Tasks must link to an active execution goal.",
        });
      }
    }

    const taskError = finishableTaskError(body.title);
    if (taskError) return apiError("invalid_request", { message: taskError });

    const resolvedDueDate = body.dueDate === "today" ? todayStr() : (body.dueDate ?? null);

    if (linkedGoalId && resolvedDueDate) {
      const { count } = await supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("goal_id", linkedGoalId)
        .eq("due_date", resolvedDueDate)
        .in("status", ["pending", "in_progress", "completed"]);

      if ((count ?? 0) >= TASKS_PER_GOAL) {
        return apiError("conflict", {
          message: `You already have ${TASKS_PER_GOAL} tasks for this goal today. Finish or drop one first.`,
        });
      }
    }

    let dupQuery = supabase
      .from("tasks")
      .select("id")
      .eq("user_id", user.id)
      .ilike("title", body.title)
      .in("status", ["pending", "in_progress"]);
    if (resolvedDueDate) dupQuery = dupQuery.eq("due_date", resolvedDueDate);

    const { data: duplicate } = await dupQuery.limit(1).maybeSingle();
    if (duplicate) {
      return apiError("conflict", { message: "You already have that task for that day." });
    }

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        user_id: user.id,
        title: body.title,
        description: body.description || null,
        goal_id: linkedGoalId,
        due_date: resolvedDueDate,
        scheduled_time: body.scheduledTime || null,
        recurrence: body.recurrence || null,
        estimated_minutes: body.estimatedMinutes || null,
      })
      .select()
      .single();

    if (error) return apiDbError("tasks", error, { userId: user.id });

    invalidateUserCache(user.id, "task created");
    return NextResponse.json({ task: data }, { status: 201 });
  }
);

export const PATCH = withAuth(
  { scope: "tasks", body: UpdateSchema, rateLimit: RATE_LIMITS.write },
  async ({ user, supabase, body, log }) => {
    const { id, actualMinutes, ...rest } = body;

    const updates: Record<string, unknown> = {};
    if (rest.status !== undefined) updates.status = rest.status;
    if (rest.title !== undefined) updates.title = rest.title;
    if (rest.description !== undefined) updates.description = rest.description;
    if (rest.dueDate !== undefined) updates.due_date = rest.dueDate;
    if (rest.scheduledTime !== undefined) updates.scheduled_time = rest.scheduledTime;
    if (rest.estimatedMinutes !== undefined) updates.estimated_minutes = rest.estimatedMinutes;
    if (actualMinutes !== undefined) updates.actual_minutes = actualMinutes;

    // Skipping a task is signal: count it, and re-evaluate the plan.
    if (rest.status === "skipped" || rest.status === "missed") {
      const { data: existing } = await supabase
        .from("tasks")
        .select("skip_count")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing) {
        updates.skip_count = (existing.skip_count || 0) + 1;
        buildCognitiveState(user.id)
          .then((state) => autoEvolveAndApply(user.id, state))
          .catch((err) => log.error("task evolution trigger failed", err));
      }
    }

    let completedMeta: { lifeArea: string; title?: string } | null = null;

    if (rest.status === "completed") {
      const { data: existing } = await supabase
        .from("tasks")
        .select(
          "streak_count, last_completed_at, recurrence, title, goal_id, description, scheduled_time, estimated_minutes, goals(life_area)"
        )
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing) {
        const lifeArea =
          (existing as { goals?: { life_area?: string } | null }).goals?.life_area || "personal";
        completedMeta = { lifeArea, title: existing.title ?? undefined };
        updates.last_completed_at = new Date().toISOString();

        // A gap of more than a day breaks the streak.
        const last = existing.last_completed_at ? new Date(existing.last_completed_at) : null;
        const daysSince = last
          ? Math.floor((Date.now() - last.getTime()) / 86400000)
          : Number.POSITIVE_INFINITY;
        updates.streak_count = daysSince <= 1 ? (existing.streak_count || 0) + 1 : 1;

        if (existing.recurrence) {
          const { error: recurError } = await supabase.from("tasks").insert({
            user_id: user.id,
            title: existing.title || "Recurring task",
            goal_id: existing.goal_id || null,
            description: existing.description || null,
            scheduled_time: existing.scheduled_time || null,
            estimated_minutes: existing.estimated_minutes || null,
            due_date: nextDueDate(existing.recurrence),
            recurrence: existing.recurrence,
          });
          if (recurError) {
            // The next occurrence failing should not fail this completion, but
            // losing it silently means the habit quietly stops recurring.
            log.error("failed to schedule next recurrence", recurError, { taskId: id });
          }
        }
      }
    }

    const { data, error } = await supabase
      .from("tasks")
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) return apiDbError("tasks", error, { userId: user.id });

    if (rest.status === "completed" && completedMeta) {
      trackProductEventOnce(user.id, "task_completed").catch(() => {});
      trackProductEvent(user.id, "task_completed", {
        lifeArea: completedMeta.lifeArea,
        title: completedMeta.title,
      }).catch(() => {});
    }

    invalidateUserCache(user.id, "task updated");

    if (rest.status === "completed") {
      scheduleUserModelRefresh(supabase, user.id);
      const goalId = data?.goal_id as string | null;
      if (goalId) {
        upsertGoalProgressSnapshotForGoal(supabase, user.id, goalId).catch((err) =>
          logger.warn("[tasks] snapshot upsert failed", { error: String(err) })
        );
      }
    }

    return NextResponse.json({ task: data });
  }
);

export const DELETE = withAuth(
  { scope: "tasks", query: QuerySchema.required({ id: true }), rateLimit: RATE_LIMITS.write },
  async ({ user, supabase, query }) => {
    const { error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", query.id)
      .eq("user_id", user.id);

    if (error) return apiDbError("tasks", error, { userId: user.id });

    invalidateUserCache(user.id, "task deleted");
    return NextResponse.json({ success: true });
  }
);
