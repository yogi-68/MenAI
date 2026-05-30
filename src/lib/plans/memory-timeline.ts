import type { SupabaseClient } from "@supabase/supabase-js";

export interface TimelineEvent {
  month: string;
  label: string;
  detail: string;
  category: "direction" | "initiative" | "execution" | "reflection" | "review";
}

export async function buildMemoryTimeline(
  supabase: SupabaseClient,
  userId: string,
  limit = 24
): Promise<TimelineEvent[]> {
  const since = new Date();
  since.setMonth(since.getMonth() - 12);
  const sinceIso = since.toISOString();

  const [goalsRes, initiativesRes, reflectionsRes, reviewsRes, tasksRes] = await Promise.all([
    supabase
      .from("goals")
      .select("title, created_at, status")
      .eq("user_id", userId)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false }),
    supabase
      .from("initiatives")
      .select("title, created_at, status, target_date, progress, completed_at, completion_review")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("daily_reflections")
      .select("reflection_date, moved_forward, blocked_by")
      .eq("user_id", userId)
      .order("reflection_date", { ascending: false })
      .limit(30),
    supabase
      .from("weekly_reviews")
      .select("week_start, content")
      .eq("user_id", userId)
      .order("week_start", { ascending: false })
      .limit(12),
    supabase
      .from("tasks")
      .select("title, completed_at")
      .eq("user_id", userId)
      .eq("status", "completed")
      .gte("completed_at", sinceIso)
      .order("completed_at", { ascending: false })
      .limit(40),
  ]);

  const events: TimelineEvent[] = [];

  for (const g of goalsRes.data || []) {
    events.push({
      month: monthLabel(g.created_at),
      label: `Direction: ${g.title}`,
      detail: g.status === "completed" ? "Marked complete" : "Added as long-term direction",
      category: "direction",
    });
  }

  for (const i of initiativesRes.data || []) {
    const review = i.completion_review as { timelineEntry?: string; summary?: string } | null;
    events.push({
      month: monthLabel(i.completed_at || i.created_at),
      label: i.title,
      detail:
        i.status === "completed"
          ? review?.timelineEntry || review?.summary || "Initiative completed"
          : i.progress
            ? `${i.progress}% progress${i.target_date ? ` · due ${i.target_date}` : ""}`
            : "Initiative started",
      category: "initiative",
    });
  }

  for (const r of reflectionsRes.data || []) {
    events.push({
      month: monthLabel(r.reflection_date + "T12:00:00"),
      label: "Daily reflection",
      detail: r.moved_forward?.slice(0, 120) || "Logged end-of-day reflection",
      category: "reflection",
    });
  }

  for (const rev of reviewsRes.data || []) {
    const content = rev.content as { narrative?: string };
    events.push({
      month: monthLabel(rev.week_start + "T12:00:00"),
      label: "Weekly review",
      detail: content?.narrative?.slice(0, 140) || "Week summarized",
      category: "review",
    });
  }

  const completedCount = (tasksRes.data || []).length;
  if (completedCount > 0) {
    const latest = tasksRes.data![0];
    events.push({
      month: monthLabel(latest.completed_at!),
      label: "Execution",
      detail: `Completed "${latest.title}" (+${Math.min(completedCount - 1, 20)} more recently)`,
      category: "execution",
    });
  }

  events.sort((a, b) => b.month.localeCompare(a.month));
  return events.slice(0, limit);
}

function monthLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function groupTimelineByMonth(events: TimelineEvent[]): Map<string, TimelineEvent[]> {
  const map = new Map<string, TimelineEvent[]>();
  for (const e of events) {
    const list = map.get(e.month) || [];
    list.push(e);
    map.set(e.month, list);
  }
  return map;
}
