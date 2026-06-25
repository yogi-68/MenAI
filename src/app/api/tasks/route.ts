import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { invalidateUserCache } from "@/lib/ai/orchestrator/cache-invalidation";
import { scheduleUserModelRefresh } from "@/lib/user-model/synthesis-engine";
import { finishableTaskError } from "@/lib/tasks/finishable-today";
import { TASKS_PER_GOAL } from "@/lib/plans/performance-score";
import { trackProductEventOnce, trackProductEvent } from "@/lib/analytics/track-event";
import { buildCognitiveState } from "@/lib/ai/orchestrator/cognition-engine";
import { autoEvolveAndApply } from "@/lib/ai/orchestrator/task-evolution-engine";
import { cancelLegacyDirectionTasks } from "@/lib/plans/legacy-task-cleanup";
import { isLegacyGenericTask } from "@/lib/dashboard/pending-tasks";

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await cancelLegacyDirectionTasks(supabase, user.id).catch(() => {});

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const goalId = searchParams.get("goalId");
  const dueDate = searchParams.get("dueDate"); // 'today', 'overdue', 'week'

  let query = supabase
    .from("tasks")
    .select("*")
    .eq("user_id", user.id)
    .order("due_date", { ascending: true, nullsFirst: false });

  if (status && status !== "all") {
    query = query.eq("status", status);
  } else if (!status) {
    query = query.in("status", ["pending", "in_progress"]);
  }

  if (goalId) {
    query = query.eq("goal_id", goalId);
  }

  if (dueDate === "today") {
    const today = new Date().toISOString().split("T")[0];
    query = query.eq("due_date", today);
  } else if (dueDate === "overdue") {
    const today = new Date().toISOString().split("T")[0];
    query = query.lt("due_date", today).in("status", ["pending", "in_progress"]);
  } else if (dueDate === "week") {
    const today = new Date();
    const weekLater = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    query = query.gte("due_date", today.toISOString().split("T")[0]).lte("due_date", weekLater.toISOString().split("T")[0]);
  }

  const { data, error } = await query.limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data || [];
  const filtered = rows.filter((t) => !isLegacyGenericTask(t.title || ""));

  // Skip heavy evolution on today's task list fetches
  const skipEvolution = dueDate === "today" || status === "all";
  if (!skipEvolution && status !== "completed") {
    buildCognitiveState(user.id)
      .then(state => autoEvolveAndApply(user.id, state))
      .catch(err => console.error("[TaskEvolution] Async trigger failed:", err));
  }

  return NextResponse.json({ tasks: filtered });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { title, description, goalId, initiativeId, dueDate, scheduledTime, recurrence, estimatedMinutes } = body;
  const linkedGoalId = goalId || initiativeId || null;

  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  if (linkedGoalId) {
    const { data: execGoal } = await supabase
      .from("goals")
      .select("id")
      .eq("id", linkedGoalId)
      .eq("user_id", user.id)
      .eq("goal_kind", "execution")
      .eq("status", "active")
      .maybeSingle();
    if (!execGoal) {
      return NextResponse.json(
        { error: "Tasks must link to an active execution goal, not a direction goal." },
        { status: 400 }
      );
    }
  }

  const normalizedTitle = title.trim();
  const taskError = finishableTaskError(normalizedTitle);
  if (taskError) {
    return NextResponse.json({ error: taskError }, { status: 400 });
  }

  const resolvedDueDate =
    dueDate === "today" ? new Date().toISOString().split("T")[0] : dueDate || null;

  if (linkedGoalId && resolvedDueDate) {
    const { count } = await supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("goal_id", linkedGoalId)
      .eq("due_date", resolvedDueDate)
      .in("status", ["pending", "in_progress", "completed"]);
    if ((count ?? 0) >= TASKS_PER_GOAL) {
      return NextResponse.json(
        { error: `Maximum ${TASKS_PER_GOAL} tasks per goal per day. Complete or remove a task first.` },
        { status: 400 }
      );
    }
  }

  let dupQuery = supabase
    .from("tasks")
    .select("id")
    .eq("user_id", user.id)
    .ilike("title", normalizedTitle)
    .in("status", ["pending", "in_progress"]);

  if (dueDate) dupQuery = dupQuery.eq("due_date", dueDate);

  const { data: existingDup } = await dupQuery.limit(1).maybeSingle();
  if (existingDup) {
    return NextResponse.json(
      { error: "A task with this title already exists for that date" },
      { status: 409 }
    );
  }

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      user_id: user.id,
      title: normalizedTitle,
      description: description || null,
      goal_id: linkedGoalId,
      due_date: dueDate || null,
      scheduled_time: scheduledTime || null,
      recurrence: recurrence || null,
      estimated_minutes: estimatedMinutes || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  
  // Invalidate cache so AI gets fresh task context
  invalidateUserCache(user.id, "task created");
  
  return NextResponse.json({ task: data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  // Accept actualMinutes on completion for time learning
  if (updates.actualMinutes !== undefined) {
    updates.actual_minutes = updates.actualMinutes;
    delete updates.actualMinutes;
  }

  // Handle skip_count incrementing when a task is skipped
  if (updates.status === "skipped" || updates.status === "missed") {
    const { data: existing } = await supabase
      .from("tasks")
      .select("skip_count")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();
      
    if (existing) {
      updates.skip_count = (existing.skip_count || 0) + 1;
      
      // Async trigger evolution immediately upon skipping
      buildCognitiveState(user.id)
        .then(state => autoEvolveAndApply(user.id, state))
        .catch(err => console.error("[TaskEvolution] Async trigger failed:", err));
    }
  }

  // If completing a task, update last_completed_at and potentially streak
  let completedMeta: { lifeArea: string; title?: string } | null = null;
  if (updates.status === "completed") {
    const { data: existing } = await supabase
      .from("tasks")
      .select("streak_count, last_completed_at, recurrence, title, goal_id, description, scheduled_time, estimated_minutes, goals(life_area)")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (existing) {
      const lifeArea =
        (existing as { goals?: { life_area?: string } | null }).goals?.life_area ||
        "personal";
      completedMeta = { lifeArea, title: existing.title ?? undefined };
      updates.last_completed_at = new Date().toISOString();

      // Update streak
      if (existing.last_completed_at) {
        const lastCompleted = new Date(existing.last_completed_at);
        const daysDiff = Math.floor((Date.now() - lastCompleted.getTime()) / (1000 * 60 * 60 * 24));
        if (daysDiff <= 1) {
          updates.streak_count = (existing.streak_count || 0) + 1;
        } else {
          updates.streak_count = 1; // reset streak
        }
      } else {
        updates.streak_count = 1;
      }

      // If recurring, create next instance (async, don't wait)
      if (existing.recurrence && updates.status === "completed") {
        const nextDue = getNextDueDate(existing.recurrence);
        supabase.from("tasks").insert({
          user_id: user.id,
          title: existing.title || "Recurring task",
          goal_id: existing.goal_id || null,
          description: existing.description || null,
          scheduled_time: existing.scheduled_time || null,
          estimated_minutes: existing.estimated_minutes || null,
          due_date: nextDue,
          recurrence: existing.recurrence,
        }).then(); // Fire and forget
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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (updates.status === "completed" && completedMeta) {
    trackProductEventOnce(user.id, "task_completed").catch(() => {});
    trackProductEvent(user.id, "task_completed", {
      lifeArea: completedMeta.lifeArea,
      title: completedMeta.title,
    }).catch(() => {});
  }

  invalidateUserCache(user.id, "task updated");
  if (updates.status === "completed") {
    scheduleUserModelRefresh(supabase, user.id);
  }

  return NextResponse.json({ task: data });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  
  // Invalidate cache after task deletion
  invalidateUserCache(user.id, "task deleted");
  
  return NextResponse.json({ success: true });
}

function getNextDueDate(recurrence: string): string {
  const today = new Date();
  switch (recurrence) {
    case "daily":
      today.setDate(today.getDate() + 1);
      break;
    case "weekly":
      today.setDate(today.getDate() + 7);
      break;
    case "weekdays":
      do {
        today.setDate(today.getDate() + 1);
      } while (today.getDay() === 0 || today.getDay() === 6);
      break;
  }
  return today.toISOString().split("T")[0];
}
