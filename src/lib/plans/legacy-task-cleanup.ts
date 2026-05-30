import type { SupabaseClient } from "@supabase/supabase-js";
import { isLegacyGenericTask } from "@/lib/dashboard/pending-tasks";

/** Cancel orphaned goal-linked and legacy generic tasks — direction must not drive execution. */
export async function cancelLegacyDirectionTasks(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title, goal_id, initiative_id, status")
    .eq("user_id", userId)
    .in("status", ["pending", "in_progress"]);

  const toCancel = (tasks || []).filter(
    (t) =>
      (t.goal_id && !t.initiative_id) ||
      isLegacyGenericTask(t.title || "")
  );

  if (toCancel.length === 0) return 0;

  const ids = toCancel.map((t) => t.id);
  await supabase
    .from("tasks")
    .update({ status: "skipped" })
    .in("id", ids);

  return ids.length;
}
