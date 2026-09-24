import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchActiveExecutionGoals } from "@/lib/goals/active-goals";
import { fetchTodayTaskStats, todayPlanScorePercent } from "@/lib/plans/today-task-stats";

export const TASKS_PER_GOAL = 3;

export interface PerformanceScore {
  daily: number;
  weekly: number;
  monthly: number;
  average: number;
  successRate: number;
  completionPct: number;
  streak: number;
  missedDays: number;
  weekAvg: number;
  prevWeekAvg: number;
  weekDelta: number;
  goalScores: Array<{
    goalId: string;
    title: string;
    score: number;
    completed: number;
    planned: number;
  }>;
  trend: Array<{ date: string; score: number }>;
}

function dateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

export function scoreFromCompletion(completed: number, planned = TASKS_PER_GOAL): number {
  if (planned <= 0) return 0;
  return Math.round((Math.min(completed, planned) / planned) * 100);
}

export async function computePerformanceScore(
  supabase: SupabaseClient,
  userId: string,
  referenceDate = new Date()
): Promise<PerformanceScore> {
  const today = dateStr(referenceDate);
  const since30 = dateStr(daysAgo(30));

  const [goals, tasksRes, snapshotsRes, todayStats] = await Promise.all([
    fetchActiveExecutionGoals(supabase, userId, 50),
    supabase
      .from("tasks")
      .select("id, goal_id, status, due_date, completed_at, auto_generated")
      .eq("user_id", userId)
      .eq("auto_generated", true)
      .gte("due_date", since30)
      .lte("due_date", today),
    supabase
      .from("goal_progress_snapshots")
      .select("goal_id, snapshot_date, tasks_completed_count")
      .eq("user_id", userId)
      .gte("snapshot_date", since30)
      .lte("snapshot_date", today),
    fetchTodayTaskStats(supabase, userId),
  ]);

  const tasks = tasksRes.data || [];
  const activeGoalIds = new Set(goals.map((g) => g.id));
  const snapshotByGoalDate = new Map<string, number>();
  for (const s of snapshotsRes.data || []) {
    if (!activeGoalIds.has(s.goal_id)) continue;
    snapshotByGoalDate.set(`${s.goal_id}:${s.snapshot_date}`, s.tasks_completed_count ?? 0);
  }

  const completedForGoalDate = (goalId: string, date: string): number => {
    const snapKey = `${goalId}:${date}`;
    if (snapshotByGoalDate.has(snapKey)) {
      return snapshotByGoalDate.get(snapKey)!;
    }
    const dayTasks = tasks.filter(
      (t) => t.due_date === date && t.goal_id === goalId
    );
    return dayTasks.filter((t) => t.status === "completed").length;
  };

  const tasksForDate = (date: string) =>
    tasks.filter((t) => t.due_date === date && t.goal_id && activeGoalIds.has(t.goal_id));

  const scoreForDate = (date: string): number => {
    if (goals.length === 0) return 0;
    let dayTotal = 0;
    for (const goal of goals) {
      const completed = completedForGoalDate(goal.id, date);
      dayTotal += scoreFromCompletion(completed);
    }
    return Math.round(dayTotal / goals.length);
  };

  const dailyGoalScores = goals.map((goal) => {
    const dayTasks = tasksForDate(today).filter((t) => t.goal_id === goal.id);
    const completed = dayTasks.filter((t) => t.status === "completed").length;
    const planned = dayTasks.length > 0 ? Math.min(TASKS_PER_GOAL, dayTasks.length) : TASKS_PER_GOAL;
    return {
      goalId: goal.id,
      title: goal.title,
      score: scoreFromCompletion(completed, planned),
      completed,
      planned: TASKS_PER_GOAL,
    };
  });

  const daily = todayPlanScorePercent(todayStats);

  const dailyScores: number[] = [];
  const trend: Array<{ date: string; score: number }> = [];
  let missedDays = 0;
  let streak = 0;
  let streakBroken = false;

  for (let i = 29; i >= 0; i--) {
    const d = dateStr(daysAgo(i));
    const dayTasks = tasksForDate(d);
    if (goals.length === 0) continue;

    const dayScore = scoreForDate(d);
    dailyScores.push(dayScore);
    trend.push({ date: d, score: dayScore });

    if (d <= today) {
      if (dayScore === 0 && dayTasks.length > 0) missedDays += 1;
      if (!streakBroken) {
        if (dayScore >= 66) streak += 1;
        else if (d !== today || dayScore < 66) streakBroken = true;
      }
    }
  }

  if (goals.length > 0 && !trend.some((t) => t.date === today)) {
    const todayScore = scoreForDate(today);
    dailyScores.push(todayScore);
    trend.push({ date: today, score: todayScore });
  }

  const last7 = dailyScores.slice(-7);
  const prev7 = dailyScores.slice(-14, -7);
  const weekly =
    last7.length > 0 ? Math.round(last7.reduce((a, b) => a + b, 0) / last7.length) : 0;
  const weekAvg = weekly;
  const prevWeekAvg =
    prev7.length > 0 ? Math.round(prev7.reduce((a, b) => a + b, 0) / prev7.length) : 0;
  const weekDelta = weekAvg - prevWeekAvg;
  const monthly =
    dailyScores.length > 0
      ? Math.round(dailyScores.reduce((a, b) => a + b, 0) / dailyScores.length)
      : 0;
  const average = monthly;

  const allTasks30 = tasks.filter((t) => t.goal_id && activeGoalIds.has(t.goal_id));
  const completed30 = allTasks30.filter((t) => t.status === "completed").length;
  const planned30 = allTasks30.length || goals.length * TASKS_PER_GOAL * 30;
  const completionPct =
    planned30 > 0 ? Math.round((completed30 / planned30) * 100) : 0;
  const successRate =
    dailyScores.filter((s) => s >= 66).length / Math.max(1, dailyScores.length);
  const successRatePct = Math.round(successRate * 100);

  return {
    daily,
    weekly,
    monthly,
    average,
    successRate: successRatePct,
    completionPct,
    streak,
    missedDays,
    weekAvg,
    prevWeekAvg,
    weekDelta,
    goalScores: dailyGoalScores,
    trend: trend.slice(-14),
  };
}

/** Row shapes the analytics computation needs, whatever query produced them. */
interface GoalAnalyticsInput {
  goal: GoalRow;
  tasks: TaskRow[];
  milestones: MilestoneRow[];
  snapshots: SnapshotRow[];
}

/**
 * Goal fields the analytics computation and its consumers read.
 * Structurally compatible with ExecutionGoalRow, so either can be passed.
 */
type GoalRow = {
  id: string;
  title: string;
  description: string | null;
  success_criteria?: string | null;
  target_date: string | null;
  progress: number | null;
  life_area: string | null;
  last_action_at: string | null;
  status: string;
  parent_goal_id?: string | null;
  priority?: string | null;
  goal_kind?: string | null;
};
type TaskRow = {
  id: string;
  status: string;
  due_date: string | null;
  completed_at: string | null;
  goal_id?: string | null;
};
type MilestoneRow = {
  id?: string;
  goal_id?: string | null;
  status: string;
  title: string;
  sort_order?: number | null;
  target_date?: string | null;
  description?: string | null;
};
type SnapshotRow = {
  goal_id?: string | null;
  snapshot_date: string;
  progress_pct: number | null;
  tasks_completed_count: number | null;
};

/** Columns selected for analytics. Named once so single and batch agree. */
const ANALYTICS_TASK_COLUMNS =
  "id, goal_id, status, due_date, completed_at, auto_generated, title, recurrence";

/**
 * Analytics for one goal.
 *
 * Prefer computeGoalAnalyticsBatch when you need more than one: this issues
 * four queries per call, and the dashboard calls it once per goal.
 */
export async function computeGoalAnalytics(
  supabase: SupabaseClient,
  userId: string,
  goalId: string
) {
  const since90 = dateStr(daysAgo(90));

  const [goalRes, tasksRes, milestonesRes, snapshotsRes] = await Promise.all([
    supabase.from("goals").select("*").eq("id", goalId).eq("user_id", userId).single(),
    supabase
      .from("tasks")
      .select(ANALYTICS_TASK_COLUMNS)
      .eq("user_id", userId)
      .eq("goal_id", goalId)
      .eq("auto_generated", true)
      .gte("due_date", since90),
    supabase.from("goal_milestones").select("*").eq("goal_id", goalId).order("sort_order"),
    supabase
      .from("goal_progress_snapshots")
      .select("goal_id, snapshot_date, progress_pct, tasks_completed_count")
      .eq("goal_id", goalId)
      .eq("user_id", userId)
      .gte("snapshot_date", since90),
  ]);

  if (!goalRes.data) return null;

  return computeGoalAnalyticsFrom({
    goal: goalRes.data as unknown as GoalRow,
    tasks: (tasksRes.data || []) as TaskRow[],
    milestones: (milestonesRes.data || []) as unknown as MilestoneRow[],
    snapshots: (snapshotsRes.data || []) as SnapshotRow[],
  });
}

/**
 * Analytics for many goals in four queries total.
 *
 * The dashboard previously mapped computeGoalAnalytics over up to twelve
 * goals, i.e. forty-eight round trips for a single page load. Here each table
 * is read once with an `in` filter and grouped in memory.
 */
export async function computeGoalAnalyticsBatch(
  supabase: SupabaseClient,
  userId: string,
  goals: GoalRow[]
): Promise<Map<string, NonNullable<Awaited<ReturnType<typeof computeGoalAnalytics>>>>> {
  const results = new Map<string, NonNullable<Awaited<ReturnType<typeof computeGoalAnalytics>>>>();
  if (goals.length === 0) return results;

  const since90 = dateStr(daysAgo(90));
  const goalIds = goals.map((g) => g.id);

  const [tasksRes, milestonesRes, snapshotsRes] = await Promise.all([
    supabase
      .from("tasks")
      .select(ANALYTICS_TASK_COLUMNS)
      .eq("user_id", userId)
      .in("goal_id", goalIds)
      .eq("auto_generated", true)
      .gte("due_date", since90),
    supabase.from("goal_milestones").select("*").in("goal_id", goalIds).order("sort_order"),
    supabase
      .from("goal_progress_snapshots")
      .select("goal_id, snapshot_date, progress_pct, tasks_completed_count")
      .eq("user_id", userId)
      .in("goal_id", goalIds)
      .gte("snapshot_date", since90),
  ]);

  const groupBy = <T extends { goal_id?: string | null }>(rows: T[] | null) => {
    const map = new Map<string, T[]>();
    for (const row of rows || []) {
      const key = row.goal_id;
      if (!key) continue;
      const list = map.get(key);
      if (list) list.push(row);
      else map.set(key, [row]);
    }
    return map;
  };

  const tasksByGoal = groupBy((tasksRes.data || []) as TaskRow[]);
  const milestonesByGoal = groupBy((milestonesRes.data || []) as unknown as MilestoneRow[]);
  const snapshotsByGoal = groupBy((snapshotsRes.data || []) as SnapshotRow[]);

  for (const goal of goals) {
    results.set(
      goal.id,
      computeGoalAnalyticsFrom({
        goal,
        tasks: tasksByGoal.get(goal.id) ?? [],
        milestones: milestonesByGoal.get(goal.id) ?? [],
        snapshots: snapshotsByGoal.get(goal.id) ?? [],
      })
    );
  }

  return results;
}

/** Pure computation over already-fetched rows. No I/O. */
function computeGoalAnalyticsFrom({ goal, tasks, milestones, snapshots }: GoalAnalyticsInput) {
  const today = dateStr(new Date());
  const snapshotByDate = new Map(snapshots.map((s) => [s.snapshot_date, s]));
  const dailyTrend: Array<{ date: string; score: number; completed: number }> = [];
  const missedDays: string[] = [];
  let streak = 0;
  let streakActive = true;

  for (let i = 89; i >= 0; i--) {
    const d = dateStr(daysAgo(i));
    const snapshot = snapshotByDate.get(d);
    if (snapshot) {
      const completed = snapshot.tasks_completed_count ?? 0;
      const score = scoreFromCompletion(completed);
      dailyTrend.push({ date: d, score, completed });
      const dayTasks = tasks.filter((t) => t.due_date === d);
      if (dayTasks.length > 0 && completed === 0) missedDays.push(d);
    } else {
      const dayTasks = tasks.filter((t) => t.due_date === d);
      const completed = dayTasks.filter((t) => t.status === "completed").length;
      const score = scoreFromCompletion(completed);
      dailyTrend.push({ date: d, score, completed });
      if (dayTasks.length > 0 && completed === 0) missedDays.push(d);
    }
    if (streakActive && d <= today) {
      const dayScore = dailyTrend[dailyTrend.length - 1]?.score ?? 0;
      if (dayScore >= 66) streak += 1;
      else if (d !== today) streakActive = false;
    }
  }

  const targetDate = goal.target_date ? new Date(goal.target_date) : null;
  const remainingDays = targetDate
    ? Math.max(0, Math.ceil((targetDate.getTime() - Date.now()) / 86400000))
    : null;

  const recentScores = dailyTrend.slice(-14).map((d) => d.score);
  const avgRecent =
    recentScores.length > 0
      ? recentScores.reduce((a, b) => a + b, 0) / recentScores.length
      : 0;
  const progress = goal.progress || 0;
  const dailyProgressNeeded =
    remainingDays && remainingDays > 0
      ? Math.max(0, (100 - progress) / remainingDays)
      : null;

  const estimatedCompletionDate =
    avgRecent > 0 && progress < 100
      ? dateStr(
          new Date(Date.now() + ((100 - progress) / (avgRecent / 100)) * 86400000)
        )
      : goal.target_date;

  const successProbability = Math.min(
    98,
    Math.round(avgRecent * 0.6 + progress * 0.3 + Math.min(streak, 7) * 2)
  );

  const tasksCompletedTotal = tasks.filter((t) => t.status === "completed").length;

  let heatmapTrend = dailyTrend.slice(-30);
  const hasHeatmapData = heatmapTrend.some((d) => d.completed > 0);
  if (!hasHeatmapData) {
    const byCompletedDate = new Map<string, number>();
    for (const t of tasks) {
      if (t.status !== "completed") continue;
      const d = t.completed_at
        ? String(t.completed_at).split("T")[0]
        : t.due_date;
      if (!d) continue;
      byCompletedDate.set(d, (byCompletedDate.get(d) || 0) + 1);
    }
    heatmapTrend = heatmapTrend.map((d) => {
      const completed = byCompletedDate.get(d.date) ?? 0;
      return { ...d, completed, score: scoreFromCompletion(completed) };
    });
  }

  const currentMilestone =
    milestones.find((m) => m.status === "in_progress")?.title ??
    milestones.find((m) => m.status === "pending")?.title ??
    null;

  return {
    goal,
    milestones,
    currentMilestone,
    dailyTrend: heatmapTrend,
    weeklyTrend: aggregateWeekly(dailyTrend),
    monthlyTrend: aggregateMonthly(dailyTrend),
    streak,
    missedDays: missedDays.slice(-14),
    remainingDays,
    daysCompleted: dailyTrend.filter((d) => d.score >= 66).length,
    progress,
    estimatedCompletionDate,
    successProbability,
    tasksCompletedTotal,
    dailyProgressNeeded,
    todayScore: dailyTrend.find((d) => d.date === today)?.score ?? 0,
    todayCompleted: dailyTrend.find((d) => d.date === today)?.completed ?? 0,
  };
}

function aggregateWeekly(data: Array<{ date: string; score: number }>) {
  const weeks: Record<string, number[]> = {};
  for (const row of data) {
    const d = new Date(row.date);
    const key = `${d.getFullYear()}-W${Math.ceil((d.getDate() + 1) / 7)}`;
    if (!weeks[key]) weeks[key] = [];
    weeks[key].push(row.score);
  }
  return Object.entries(weeks).map(([week, scores]) => ({
    week,
    score: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
  }));
}

function aggregateMonthly(data: Array<{ date: string; score: number }>) {
  const months: Record<string, number[]> = {};
  for (const row of data) {
    const key = row.date.slice(0, 7);
    if (!months[key]) months[key] = [];
    months[key].push(row.score);
  }
  return Object.entries(months).map(([month, scores]) => ({
    month,
    score: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
  }));
}
