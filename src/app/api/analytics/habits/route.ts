import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const HABIT_RECURRENCES = ["daily", "weekly", "weekdays"] as const;

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: tasks, error } = await supabase
    .from("tasks")
    .select(
      "id, title, status, recurrence, streak_count, last_completed_at, due_date, goal_id, goals(title, life_area)"
    )
    .eq("user_id", user.id)
    .in("recurrence", [...HABIT_RECURRENCES])
    .order("streak_count", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const habits = (tasks || []).map((t) => {
    const goal = t.goals as { title?: string; life_area?: string } | null;
    return {
      id: t.id,
      title: t.title,
      status: t.status,
      recurrence: t.recurrence,
      streakCount: t.streak_count ?? 0,
      lastCompletedAt: t.last_completed_at,
      dueDate: t.due_date,
      goalId: t.goal_id,
      goalTitle: goal?.title ?? null,
      lifeArea: goal?.life_area ?? null,
    };
  });

  const byRecurrence = HABIT_RECURRENCES.map((r) => ({
    label: r,
    value: habits.filter((h) => h.recurrence === r).length,
  })).filter((b) => b.value > 0);

  const topStreaks = [...habits]
    .sort((a, b) => b.streakCount - a.streakCount)
    .slice(0, 8)
    .map((h) => ({
      label: h.title.length > 22 ? h.title.slice(0, 20) + "…" : h.title,
      value: h.streakCount,
      id: h.id,
    }));

  const activeStreaks = habits.filter((h) => h.streakCount > 0).length;
  const longestStreak = habits.reduce((max, h) => Math.max(max, h.streakCount), 0);

  return NextResponse.json({
    habits,
    total: habits.length,
    activeStreaks,
    longestStreak,
    byRecurrence,
    topStreaks,
  });
}
