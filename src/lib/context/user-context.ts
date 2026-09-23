import type { SupabaseClient } from "@supabase/supabase-js";
import { computePerformanceScore } from "@/lib/plans/performance-score";
import { getCurrentPhase } from "@/lib/plans/rhythm-phase";
import { fetchActiveExecutionGoals } from "@/lib/goals/active-goals";
import { loadMentorMemories } from "@/lib/mentor/mentor-memory";
import { getUserModel } from "@/lib/user-model/loader";
import {
  CACHE_TTL,
  getFromCache,
  REDIS_KEYS,
  setInCache,
} from "@/lib/redis/client";
import { formatKnowledgeBulletsForRail } from "@/lib/plans/task-why-line";
import type { ExecutionAllocationEntry } from "@/lib/user-model/execution-allocation";
import type { UserModel } from "@/lib/user-model/types";

export interface UserContextGoal {
  id: string;
  title: string;
  progress: number;
  targetDate: string | null;
  remainingDays: number | null;
}

export interface UserContextTask {
  id: string;
  title: string;
  status: string;
  goalTitle: string | null;
}

export interface UserContextMemory {
  text: string;
  memoryType: string;
}

export interface UserContext {
  profile: {
    name: string | null;
    timezone: string | null;
    streakDays: number;
  };
  userModel: {
    identity: string[];
    values: string[];
    patterns: string[];
    currentFocus: string | null;
  };
  activeGoals: UserContextGoal[];
  todayPlan: UserContextTask[];
  recentMemories: UserContextMemory[];
  lastAchievement: string | null;
  rhythmPhase: ReturnType<typeof getCurrentPhase>;
  scoreToday: number;
  knowledgeBullets: string[];
  userModelNarrative: string;
  executionAllocation: ExecutionAllocationEntry[];
  currentFocusInitiativeId: string | null;
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

const ACHIEVEMENT_PATTERN =
  /\b(secured|landed|closed|completed|finished|achieved|won|signed|launched|hit|reached|first client|milestone)\b/i;

function pickLastAchievement(
  memories: UserContextMemory[],
  completedTasks: Array<{ title: string; completed_at: string | null }>,
  userModel: UserModel
): string | null {
  const memoryWin = memories.find((m) => ACHIEVEMENT_PATTERN.test(m.text));
  if (memoryWin) return memoryWin.text.trim();

  const recentTask = completedTasks.find((t) => t.completed_at);
  if (recentTask) {
    return `Completed "${recentTask.title}" recently`;
  }

  const evidence = userModel.evidence?.find((item) => ACHIEVEMENT_PATTERN.test(item));
  if (evidence) return evidence.trim();

  if (userModel.recentActivity && ACHIEVEMENT_PATTERN.test(userModel.recentActivity)) {
    return userModel.recentActivity.trim();
  }

  return null;
}

function buildKnowledgeBullets(userModel: UserModel): string[] {
  const identityBullets =
    userModel.identity.labels.length > 0
      ? userModel.identity.labels
      : userModel.whoAmIStatements?.map((s) => s.text).filter(Boolean) ?? [];

  const source =
    userModel.understands.length > 0
      ? userModel.understands
      : identityBullets.length > 0
        ? identityBullets
        : userModel.whoAmIAnswer
            ?.split("\n")
            .map((line) => line.replace(/^[·\-•]\s*/, "").trim())
            .filter(Boolean) ?? [];

  return formatKnowledgeBulletsForRail(source);
}

async function assembleUserContext(
  supabase: SupabaseClient,
  userId: string
): Promise<UserContext> {
  const today = new Date().toISOString().split("T")[0];
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [
    profileRes,
    performance,
    userModel,
    goals,
    todayTasksRes,
    completedTasksRes,
    mentorMemories,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, timezone")
      .eq("id", userId)
      .maybeSingle(),
    computePerformanceScore(supabase, userId),
    getUserModel(supabase, userId),
    fetchActiveExecutionGoals(supabase, userId, 12),
    supabase
      .from("tasks")
      .select("id, title, status, goal_id")
      .eq("user_id", userId)
      .eq("due_date", today)
      .order("created_at", { ascending: true }),
    supabase
      .from("tasks")
      .select("title, completed_at")
      .eq("user_id", userId)
      .eq("status", "completed")
      .gte("completed_at", sevenDaysAgo.toISOString())
      .order("completed_at", { ascending: false })
      .limit(5),
    loadMentorMemories(supabase, userId, 5),
  ]);

  const goalById = new Map(goals.map((g) => [g.id, g.title]));
  const recentMemories: UserContextMemory[] = mentorMemories.map((m) => ({
    text: m.text,
    memoryType: m.memoryType,
  }));

  const lastAchievement = pickLastAchievement(
    recentMemories,
    completedTasksRes.data ?? [],
    userModel
  );

  const activeGoals: UserContextGoal[] = goals.map((g) => ({
    id: g.id,
    title: g.title,
    progress: g.progress ?? 0,
    targetDate: g.target_date,
    remainingDays: g.target_date ? daysUntil(g.target_date) : null,
  }));

  const todayPlan: UserContextTask[] = (todayTasksRes.data ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    goalTitle: t.goal_id ? goalById.get(t.goal_id) ?? null : null,
  }));

  return {
    profile: {
      name: profileRes.data?.full_name ?? null,
      timezone: profileRes.data?.timezone ?? null,
      streakDays: performance.streak,
    },
    userModel: {
      identity: userModel.identity.labels,
      values: userModel.understands.slice(0, 6),
      patterns: userModel.obstacles.slice(0, 4),
      currentFocus: userModel.currentFocus.title,
    },
    activeGoals,
    todayPlan,
    recentMemories,
    lastAchievement,
    rhythmPhase: getCurrentPhase(),
    scoreToday: performance.daily,
    knowledgeBullets: userModel.knowledgeBullets?.length
      ? userModel.knowledgeBullets
      : buildKnowledgeBullets(userModel),
    userModelNarrative: userModel.narrative,
    executionAllocation: userModel.executionAllocation,
    currentFocusInitiativeId: userModel.currentFocus.initiativeId,
  };
}

/** Cached unified context — planner, coach rail, and snapshot read the same object. */
export async function getUserContext(
  supabase: SupabaseClient,
  userId: string,
  options?: { refresh?: boolean }
): Promise<UserContext> {
  const cacheKey = REDIS_KEYS.USER_CONTEXT(userId);

  if (!options?.refresh) {
    const cached = await getFromCache<UserContext>(cacheKey);
    if (cached) {
      if (process.env.NODE_ENV === "development") {
        console.log(`[Redis] HIT ${cacheKey}`);
      }
      return cached;
    }
  }

  if (process.env.NODE_ENV === "development") {
    const redisReady = Boolean(
      process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    );
    console.log(
      `[Redis] MISS ${cacheKey} — assembling from Supabase${redisReady ? "" : " (Redis env vars missing — every page load hits DB)"}`
    );
  }

  const context = await assembleUserContext(supabase, userId);
  await setInCache(cacheKey, context, CACHE_TTL.USER_CONTEXT);
  return context;
}

export function formatUserContextForPlanner(context: UserContext): string {
  const memoryLines = context.recentMemories
    .slice(0, 3)
    .map((m) => m.text.trim())
    .filter(Boolean);

  const lines = [
    `Identity: ${context.userModel.identity.join("; ") || "building"}`,
    `Values / coach knows: ${context.userModel.values.join("; ") || "still learning"}`,
    `Current focus: ${context.userModel.currentFocus || "not set"}`,
    context.lastAchievement
      ? `Recent win: ${context.lastAchievement}`
      : "Recent win: none logged yet — tie tasks to stated values",
    memoryLines.length > 0
      ? `Recent memories (use in task titles and whyItMatters): ${memoryLines.join(" | ")}`
      : "",
    `Today's plan: ${context.scoreToday}%`,
    `Active goals: ${context.activeGoals.map((g) => g.title).join(", ") || "none"}`,
  ].filter(Boolean);
  return lines.join("\n");
}
