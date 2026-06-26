import { getOpenAI } from "@/lib/ai/openai";
import { FAST_MODEL } from "@/lib/ai/models";
import type { SupabaseClient } from "@supabase/supabase-js";

function todayDateStr(): string {
  return new Date().toISOString().split("T")[0];
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
    const { count } = await supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("goal_id", goal.id)
      .eq("due_date", today)
      .eq("status", "completed");

    const { error } = await supabase.from("goal_progress_snapshots").upsert(
      {
        user_id: userId,
        goal_id: goal.id,
        snapshot_date: today,
        progress_pct: goal.progress ?? 0,
        tasks_completed_count: count ?? 0,
      },
      { onConflict: "goal_id,snapshot_date" }
    );

    if (!error) written += 1;
  }

  return written;
}
