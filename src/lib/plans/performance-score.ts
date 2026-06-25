import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchActiveExecutionGoals } from "@/lib/goals/active-goals";

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
  const since7 = dateStr(daysAgo(7));

  const [goals, tasksRes] = await Promise.all([
    fetchActiveExecutionGoals(supabase, userId, 50),
    supabase
      .from("tasks")
      .select("id, goal_id, status, due_date, completed_at, auto_generated")
      .eq("user_id", userId)
      .eq("auto_generated", true)
      .gte("due_date", since30)
      .lte("due_date", today),
  ]);

  const tasks = tasksRes.data || [];
  const activeGoalIds = new Set(goals.map((g) => g.id));

  const tasksForDate = (date: string) =>
    tasks.filter((t) => t.due_date === date && t.goal_id && activeGoalIds.has(t.goal_id));

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

  const daily =
    dailyGoalScores.length > 0
      ? Math.round(dailyGoalScores.reduce((s, g) => s + g.score, 0) / dailyGoalScores.length)
      : 0;

  const dailyScores: number[] = [];
  const trend: Array<{ date: string; score: number }> = [];
  let missedDays = 0;
  let streak = 0;
  let streakBroken = false;

  for (let i = 29; i >= 0; i--) {
    const d = dateStr(daysAgo(i));
    const dayTasks = tasksForDate(d);
    if (goals.length === 0) continue;

    let dayTotal = 0;
    for (const goal of goals) {
      const gt = dayTasks.filter((t) => t.goal_id === goal.id);
      const completed = gt.filter((t) => t.status === "completed").length;
      const planned = gt.length > 0 ? Math.min(TASKS_PER_GOAL, gt.length) : TASKS_PER_GOAL;
      dayTotal += scoreFromCompletion(completed, planned);
    }
    const dayScore = Math.round(dayTotal / goals.length);
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

  const last7 = dailyScores.slice(-7);
  const weekly =
    last7.length > 0 ? Math.round(last7.reduce((a, b) => a + b, 0) / last7.length) : 0;
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
    goalScores: dailyGoalScores,
    trend: trend.slice(-14),
  };
}

export async function computeGoalAnalytics(
  supabase: SupabaseClient,
  userId: string,
  goalId: string
) {
  const since90 = dateStr(daysAgo(90));
  const today = dateStr(new Date());

  const [goalRes, tasksRes, milestonesRes] = await Promise.all([
    supabase
      .from("goals")
      .select("*")
      .eq("id", goalId)
      .eq("user_id", userId)
      .single(),
    supabase
      .from("tasks")
      .select("id, status, due_date, completed_at, auto_generated, title, recurrence")
      .eq("user_id", userId)
      .eq("goal_id", goalId)
      .eq("auto_generated", true)
      .gte("due_date", since90),
    supabase
      .from("goal_milestones")
      .select("*")
      .eq("goal_id", goalId)
      .order("sort_order"),
  ]);

  const goal = goalRes.data;
  if (!goal) return null;

  const tasks = tasksRes.data || [];
  const dailyTrend: Array<{ date: string; score: number; completed: number }> = [];
  const missedDays: string[] = [];
  let streak = 0;
  let streakActive = true;

  for (let i = 89; i >= 0; i--) {
    const d = dateStr(daysAgo(i));
    const dayTasks = tasks.filter((t) => t.due_date === d);
    const completed = dayTasks.filter((t) => t.status === "completed").length;
    const score = scoreFromCompletion(completed);
    dailyTrend.push({ date: d, score, completed });
    if (dayTasks.length > 0 && completed === 0) missedDays.push(d);
    if (streakActive && d <= today) {
      if (score >= 66) streak += 1;
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

  return {
    goal,
    milestones: milestonesRes.data || [],
    dailyTrend: dailyTrend.slice(-30),
    weeklyTrend: aggregateWeekly(dailyTrend),
    monthlyTrend: aggregateMonthly(dailyTrend),
    streak,
    missedDays: missedDays.slice(-14),
    remainingDays,
    daysCompleted: dailyTrend.filter((d) => d.score >= 66).length,
    progress,
    estimatedCompletionDate,
    successProbability,
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
