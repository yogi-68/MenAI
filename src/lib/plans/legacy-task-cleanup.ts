import type { SupabaseClient } from "@supabase/supabase-js";
import { isLegacyGenericTask } from "@/lib/dashboard/pending-tasks";

/** Cancel legacy generic tasks — direction goals must not drive execution tasks. */
export async function cancelLegacyDirectionTasks(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title, goal_id, status")
    .eq("user_id", userId)
    .in("status", ["pending", "in_progress"]);

  const toCancel = (tasks || []).filter((t) => isLegacyGenericTask(t.title || ""));

  if (toCancel.length === 0) return 0;

  const ids = toCancel.map((t) => t.id);
  await supabase
    .from("tasks")
    .update({ status: "skipped" })
    .in("id", ids);

  return ids.length;
}
