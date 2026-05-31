import type { SupabaseClient } from "@supabase/supabase-js";

export interface TimelineEvent {
  sortKey: string;
  month: string;
  dayLabel: string;
  headline: string;
  subline?: string;
  category: "initiative" | "milestone" | "completion" | "execution" | "reflection" | "decision";
}

export async function buildMemoryTimeline(
  supabase: SupabaseClient,
  userId: string,
  limit = 40
): Promise<TimelineEvent[]> {
  const since = new Date();
  since.setMonth(since.getMonth() - 18);
  const sinceIso = since.toISOString();

  const [initiativesRes, milestonesRes, tasksRes, reflectionsRes] = await Promise.all([
    supabase
      .from("initiatives")
      .select("id, title, created_at, status, completed_at, completion_review, life_area, target_date")
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
    supabase
      .from("initiative_milestones")
      .select("title, status, completed_at, created_at, initiatives(title, created_at)")
      .eq("user_id", userId)
      .eq("status", "completed")
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: true }),
    supabase
      .from("tasks")
      .select("title, completed_at, auto_generated")
      .eq("user_id", userId)
      .eq("status", "completed")
      .gte("completed_at", sinceIso)
      .order("completed_at", { ascending: true })
      .limit(80),
    supabase
      .from("daily_reflections")
      .select("moved_forward, blocked_by, reflection_date, created_at")
      .eq("user_id", userId)
      .gte("reflection_date", sinceIso.split("T")[0])
      .order("reflection_date", { ascending: true })
      .limit(40),
  ]);

  const events: TimelineEvent[] = [];

  for (const i of initiativesRes.data || []) {
    if (i.status === "completed" && i.completed_at) {
      const review = i.completion_review as { timelineEntry?: string; summary?: string } | null;
      events.push({
        sortKey: i.completed_at,
        month: monthLabel(i.completed_at),
        dayLabel: dayLabel(i.completed_at),
        headline: review?.timelineEntry || `Finished ${stripPrefix(i.title)}`,
        subline: review?.summary?.slice(0, 120),
        category: "completion",
      });
    }
  }

  for (const m of milestonesRes.data || []) {
    if (!m.completed_at) continue;
    const init = m.initiatives as { title?: string; created_at?: string } | null;
    const createdAt = init?.created_at || m.created_at;
    const hoursSinceCreate =
      (new Date(m.completed_at).getTime() - new Date(createdAt).getTime()) / (1000 * 60 * 60);
    if (hoursSinceCreate < 24) continue;

    events.push({
      sortKey: m.completed_at,
      month: monthLabel(m.completed_at),
      dayLabel: dayLabel(m.completed_at),
      headline: `Completed milestone: ${m.title}`,
      subline: init?.title ? `Part of ${init.title}` : undefined,
      category: "milestone",
    });
  }

  for (const t of tasksRes.data || []) {
    if (!t.completed_at || !isExecutionEvent(t.title)) continue;
    events.push({
      sortKey: t.completed_at,
      month: monthLabel(t.completed_at),
      dayLabel: dayLabel(t.completed_at),
      headline: executionHeadline(t.title),
      category: "execution",
    });
  }

  for (const r of reflectionsRes.data || []) {
    const key = r.created_at || `${r.reflection_date}T12:00:00Z`;
    const moved = r.moved_forward?.trim();
    if (!moved || moved.length < 8) continue;
    events.push({
      sortKey: key,
      month: monthLabel(key),
      dayLabel: dayLabel(key),
      headline: moved.length > 80 ? `${moved.slice(0, 77)}…` : moved,
      subline: r.blocked_by ? `Blocked by: ${r.blocked_by.slice(0, 60)}` : "Daily reflection",
      category: "reflection",
    });
  }

  events.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  return dedupeEvents(events).slice(-limit);
}

function executionHeadline(title: string): string {
  const lower = title.toLowerCase();
  if (/workout|train|gym|run|walk|cardio|lift/.test(lower)) return `Completed workout: ${title}`;
  if (/log|track|nutrition|meal|calorie/.test(lower)) return `Logged: ${title}`;
  if (/first (user|customer|paying|sale)/i.test(title)) return title;
  if (/launch|mvp|shipped|published|passed|hired|signed/i.test(lower)) return title;
  return `Completed: ${title}`;
}

function isExecutionEvent(title: string): boolean {
  const lower = title.toLowerCase();
  if (/make progress on|context-building|add initiative|define milestone/i.test(lower)) return false;
  if (/workout|train|gym|run|walk|cardio|lift|nutrition|meal|calorie|study|chapter|mock|outreach|email|user|customer|launch|mvp|shipped|completed|finished|logged/i.test(lower))
    return true;
  return /first (user|customer|paying|sale)|launch|mvp|passed|signed/i.test(title);
}

function stripPrefix(title: string): string {
  return title.replace(/^(build|launch|start|create)\s+/i, "").trim() || title;
}

function monthLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function dedupeEvents(events: TimelineEvent[]): TimelineEvent[] {
  const seen = new Set<string>();
  const out: TimelineEvent[] = [];
  for (const e of events) {
    const key = `${e.sortKey.slice(0, 10)}:${e.headline.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
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

export function sortedTimelineMonths(events: TimelineEvent[]): string[] {
  const keys = new Map<string, string>();
  for (const e of events) {
    if (!keys.has(e.month) || e.sortKey < keys.get(e.month)!) {
      keys.set(e.month, e.sortKey);
    }
  }
  return Array.from(keys.entries())
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([month]) => month);
}
