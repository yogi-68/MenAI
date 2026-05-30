import type { SupabaseClient } from "@supabase/supabase-js";

export interface TimelineEvent {
  sortKey: string;
  month: string;
  headline: string;
  subline?: string;
  category: "direction" | "initiative" | "milestone" | "completion" | "execution";
}

export async function buildMemoryTimeline(
  supabase: SupabaseClient,
  userId: string,
  limit = 32
): Promise<TimelineEvent[]> {
  const since = new Date();
  since.setMonth(since.getMonth() - 18);
  const sinceIso = since.toISOString();

  const [goalsRes, initiativesRes, milestonesRes, tasksRes] = await Promise.all([
    supabase
      .from("goals")
      .select("title, created_at, status")
      .eq("user_id", userId)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: true }),
    supabase
      .from("initiatives")
      .select("id, title, created_at, status, completed_at, completion_review, life_area")
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
    supabase
      .from("initiative_milestones")
      .select("title, status, completed_at, created_at, initiatives(title)")
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
      .limit(60),
  ]);

  const events: TimelineEvent[] = [];

  for (const g of goalsRes.data || []) {
    events.push({
      sortKey: g.created_at,
      month: monthLabel(g.created_at),
      headline: `Wanted ${stripPrefix(g.title)}`,
      subline: "Long-term direction",
      category: "direction",
    });
  }

  for (const i of initiativesRes.data || []) {
    events.push({
      sortKey: i.created_at,
      month: monthLabel(i.created_at),
      headline: `Started ${stripPrefix(i.title)}`,
      category: "initiative",
    });

    if (i.status === "completed" && i.completed_at) {
      const review = i.completion_review as { timelineEntry?: string; summary?: string } | null;
      events.push({
        sortKey: i.completed_at,
        month: monthLabel(i.completed_at),
        headline: review?.timelineEntry || `Completed ${stripPrefix(i.title)}`,
        subline: review?.summary?.slice(0, 100),
        category: "completion",
      });
    }
  }

  for (const m of milestonesRes.data || []) {
    if (!m.completed_at) continue;
    const initTitle = (m.initiatives as { title?: string } | null)?.title;
    events.push({
      sortKey: m.completed_at,
      month: monthLabel(m.completed_at),
      headline: milestoneHeadline(m.title),
      subline: initTitle ? `Part of ${initTitle}` : undefined,
      category: "milestone",
    });
  }

  const notableTasks = (tasksRes.data || []).filter((t) => isNotableCompletion(t.title));
  for (const t of notableTasks.slice(-8)) {
    if (!t.completed_at) continue;
    events.push({
      sortKey: t.completed_at,
      month: monthLabel(t.completed_at),
      headline: taskHeadline(t.title),
      category: "execution",
    });
  }

  events.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  return dedupeEvents(events).slice(-limit);
}

function milestoneHeadline(title: string): string {
  const t = title.trim();
  if (/^(define|build|ship|launch|get|reach|complete)/i.test(t)) {
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  return t;
}

function taskHeadline(title: string): string {
  const lower = title.toLowerCase();
  if (/first (user|customer|sale|paying)/i.test(title)) return title;
  if (/launch/i.test(lower)) return title;
  if (/mvp/i.test(lower)) return `Shipped ${title}`;
  return title;
}

function isNotableCompletion(title: string): boolean {
  return /first (user|customer|paying|sale)|launch|mvp|shipped|published|passed|hired|signed/i.test(
    title
  );
}

function stripPrefix(title: string): string {
  return title.replace(/^(build|launch|start|create)\s+/i, "").trim() || title;
}

function monthLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
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

/** Months sorted chronologically for story reading (oldest → newest). */
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
