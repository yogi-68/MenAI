import type { SupabaseClient } from "@supabase/supabase-js";

function todayDateStr(): string {
  return new Date().toISOString().split("T")[0];
}

/** Upsert today's snapshot for one goal (called on task completion). */
export async function upsertGoalProgressSnapshotForGoal(
  supabase: SupabaseClient,
  userId: string,
  goalId: string
): Promise<void> {
  const today = todayDateStr();

  const [{ data: goal }, { count }] = await Promise.all([
    supabase.from("goals").select("progress").eq("id", goalId).eq("user_id", userId).maybeSingle(),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("goal_id", goalId)
      .eq("due_date", today)
      .eq("status", "completed"),
  ]);

  await supabase.from("goal_progress_snapshots").upsert(
    {
      user_id: userId,
      goal_id: goalId,
      snapshot_date: today,
      progress_pct: goal?.progress ?? 0,
      tasks_completed_count: count ?? 0,
    },
    { onConflict: "goal_id,snapshot_date" }
  );
}

/** Nightly snapshot writer — one row per active execution goal per day. */
export async function writeGoalProgressSnapshots(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const today = todayDateStr();

  const { data: goals } = await supabase
    .from("goals")
    .select("id, progress")
    .eq("user_id", userId)
    .eq("status", "active")
    .eq("goal_kind", "execution");

  if (!goals?.length) return 0;

  let written = 0;
  for (const goal of goals) {
    await upsertGoalProgressSnapshotForGoal(supabase, userId, goal.id);
    written += 1;
  }

  return written;
}
