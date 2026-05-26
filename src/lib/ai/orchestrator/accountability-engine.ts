/**
 * Accountability Engine — Follow-Through Tracking
 * 
 * The engine that makes MenAI actually different:
 * It follows up on what users say they'll do.
 * 
 * "Yesterday you said you'd finish the landing page. What happened?"
 * "You've missed sleep goals 4 days this week. Your energy decline is affecting execution."
 */

import { createServiceRoleClient } from "@/lib/supabase/server";
import type { AccountabilityItem, LifeContext } from "./types";

/**
 * Get the user's complete life context for prompt injection.
 * This is the structured data layer that supplements vector memory.
 */
export async function getLifeContext(userId: string): Promise<LifeContext | null> {
  try {
    const supabase = await createServiceRoleClient();

    // Use the RPC function for efficient single-query fetch
    const { data, error } = await supabase.rpc("get_life_context", {
      p_user_id: userId,
    });

    if (error || !data) {
      // Fallback: query tables individually
      return await getLifeContextFallback(userId, supabase);
    }

    const activeGoals = data.active_goals || [];
    const pendingTasks = data.pending_tasks || [];
    const activeCommitments = data.active_commitments || [];
    const relationships = data.relationships || [];
    const todaysPlan = data.todays_plan || undefined;

    // Build accountability items
    const accountabilityItems = buildAccountabilityItems(pendingTasks, activeCommitments);

    // Calculate momentum score
    const momentumScore = calculateMomentumScore(activeGoals, pendingTasks, activeCommitments);

    return {
      activeGoals,
      pendingTasks,
      activeCommitments,
      recentRelationships: relationships,
      todaysPlan,
      accountabilityItems,
      momentumScore,
    };
  } catch (e) {
    console.error("Life context error:", e);
    return null;
  }
}

/**
 * Fallback if RPC is not available yet (before migration)
 */
async function getLifeContextFallback(
  userId: string,
  supabase: Awaited<ReturnType<typeof createServiceRoleClient>>
): Promise<LifeContext> {
  const [goalsRes, tasksRes, commitmentsRes, relationshipsRes, planRes] = await Promise.allSettled([
    supabase.from("goals").select("*").eq("user_id", userId).eq("status", "active").order("created_at", { ascending: false }).limit(10),
    supabase.from("tasks").select("*").eq("user_id", userId).in("status", ["pending", "in_progress"]).order("due_date", { ascending: true }).limit(15),
    supabase.from("commitments").select("*").eq("user_id", userId).eq("status", "active").order("created_at", { ascending: false }).limit(10),
    supabase.from("relationships").select("*").eq("user_id", userId).order("last_mentioned_at", { ascending: false }).limit(10),
    supabase.from("daily_plans").select("*").eq("user_id", userId).eq("plan_date", new Date().toISOString().split("T")[0]).limit(1),
  ]);

  const activeGoals = goalsRes.status === "fulfilled" ? (goalsRes.value.data || []) : [];
  const pendingTasks = tasksRes.status === "fulfilled" ? (tasksRes.value.data || []) : [];
  const activeCommitments = commitmentsRes.status === "fulfilled" ? (commitmentsRes.value.data || []) : [];
  const relationships = relationshipsRes.status === "fulfilled" ? (relationshipsRes.value.data || []) : [];
  const todaysPlan = planRes.status === "fulfilled" ? (planRes.value.data?.[0] || undefined) : undefined;

  const accountabilityItems = buildAccountabilityItems(pendingTasks, activeCommitments);
  const momentumScore = calculateMomentumScore(activeGoals, pendingTasks, activeCommitments);

  return {
    activeGoals,
    pendingTasks,
    activeCommitments,
    recentRelationships: relationships,
    todaysPlan,
    accountabilityItems,
    momentumScore,
  };
}

/**
 * Build accountability items from pending tasks and active commitments
 */
function buildAccountabilityItems(
  tasks: Array<Record<string, unknown>>,
  commitments: Array<Record<string, unknown>>
): AccountabilityItem[] {
  const items: AccountabilityItem[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Overdue tasks
  for (const task of tasks) {
    if (task.due_date) {
      const dueDate = new Date(task.due_date as string);
      dueDate.setHours(0, 0, 0, 0);
      if (dueDate < today) {
        const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        items.push({
          type: "task",
          description: task.title as string,
          status: "overdue",
          dueDate: task.due_date as string,
          daysOverdue,
        });
      } else if (dueDate.getTime() === today.getTime()) {
        items.push({
          type: "task",
          description: task.title as string,
          status: "pending",
          dueDate: task.due_date as string,
        });
      }
    }
  }

  // Low-consistency commitments
  for (const commitment of commitments) {
    const score = Number(commitment.consistency_score) || 0;
    const broken = Number(commitment.times_broken) || 0;
    if (broken > 2 && score < 50) {
      items.push({
        type: "commitment",
        description: commitment.description as string,
        status: "missed",
      });
    }
  }

  return items;
}

/**
 * Calculate overall momentum score (0-100)
 * Based on task completion, goal progress, and commitment consistency
 */
function calculateMomentumScore(
  goals: Array<Record<string, unknown>>,
  tasks: Array<Record<string, unknown>>,
  commitments: Array<Record<string, unknown>>
): number {
  if (goals.length === 0 && tasks.length === 0 && commitments.length === 0) {
    return 50; // neutral if no data
  }

  let score = 50; // baseline

  // Goal progress contributes
  if (goals.length > 0) {
    const avgProgress = goals.reduce((sum, g) => sum + (Number(g.progress) || 0), 0) / goals.length;
    score += (avgProgress / 100) * 20; // up to +20
  }

  // Task completion rate
  const completedTasks = tasks.filter((t) => t.status === "completed").length;
  const totalTasks = tasks.length;
  if (totalTasks > 0) {
    score += (completedTasks / totalTasks) * 15; // up to +15
  }

  // Commitment consistency
  if (commitments.length > 0) {
    const avgConsistency = commitments.reduce((sum, c) => sum + (Number(c.consistency_score) || 0), 0) / commitments.length;
    score += (avgConsistency / 100) * 15; // up to +15
  }

  // Penalize overdue tasks
  const overdueTasks = tasks.filter((t) => {
    if (!t.due_date) return false;
    return new Date(t.due_date as string) < new Date();
  }).length;
  score -= overdueTasks * 3; // -3 per overdue task

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Format life context for natural prompt injection
 */
export function formatLifeContextForPrompt(context: LifeContext): string {
  const parts: string[] = [];

  // Momentum
  if (context.momentumScore !== 50) {
    const level = context.momentumScore > 70 ? "strong" : context.momentumScore > 40 ? "moderate" : "declining";
    parts.push(`Their current momentum is ${level} (${context.momentumScore}/100).`);
  }

  // Active goals
  if (context.activeGoals.length > 0) {
    const goalSummaries = context.activeGoals.slice(0, 5).map((g) => {
      const progress = g.progress ? ` (${g.progress}% done)` : "";
      return `${g.title}${progress} [${g.category}]`;
    });
    parts.push(`Active goals: ${goalSummaries.join("; ")}`);
  }

  // Accountability items (this is crucial)
  if (context.accountabilityItems.length > 0) {
    const overdueItems = context.accountabilityItems.filter((a) => a.status === "overdue" || a.status === "missed");
    if (overdueItems.length > 0) {
      const overdueDescs = overdueItems.slice(0, 3).map((a) => {
        const daysNote = a.daysOverdue ? ` (${a.daysOverdue} days overdue)` : "";
        return `"${a.description}"${daysNote}`;
      });
      parts.push(`FOLLOW UP: They have unfulfilled commitments: ${overdueDescs.join(", ")}. Ask about these naturally — not all at once.`);
    }
  }

  // Today's plan
  if (context.todaysPlan?.planContent) {
    const plan = context.todaysPlan.planContent;
    if (plan.tasks && plan.tasks.length > 0) {
      const remaining = plan.tasks.filter((t: Record<string, unknown>) => !t.completed).length;
      const total = plan.tasks.length;
      parts.push(`Today's plan: ${total} tasks planned, ${remaining} remaining.`);
    }
  }

  // Active commitments
  if (context.activeCommitments.length > 0) {
    const commitmentDescs = context.activeCommitments.slice(0, 3).map((c) => {
      const consistency = c.consistencyScore ? ` (${c.consistencyScore}% consistent)` : "";
      return `"${c.description}"${consistency}`;
    });
    parts.push(`Active commitments: ${commitmentDescs.join("; ")}`);
  }

  // Relationships recently mentioned
  if (context.recentRelationships.length > 0) {
    const people = context.recentRelationships.slice(0, 5).map((r) => `${r.name} (${r.role})`);
    parts.push(`People in their life: ${people.join(", ")}`);
  }

  return parts.join("\n");
}

/**
 * Detect behavioral patterns from task and goal history
 */
export interface AccountabilityPattern {
  type: "procrastination" | "overplanning" | "perfectionism" | "idea_switching" | "fear_based_avoidance";
  evidence: string[];
  frequency: number;
  lastDetected: Date;
  severity: "low" | "medium" | "high";
}

export async function detectAccountabilityPatterns(userId: string): Promise<AccountabilityPattern[]> {
  const supabase = await createServiceRoleClient();
  const patterns: AccountabilityPattern[] = [];

  // Get user's goals, tasks, and commitments for pattern detection
  const [goalsRes, tasksRes, commitmentsRes] = await Promise.allSettled([
    supabase.from("goals").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
    supabase.from("tasks").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
    supabase.from("commitments").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
  ]);

  const goals = goalsRes.status === "fulfilled" ? (goalsRes.value.data || []) : [];
  const tasks = tasksRes.status === "fulfilled" ? (tasksRes.value.data || []) : [];
  const commitments = commitmentsRes.status === "fulfilled" ? (commitmentsRes.value.data || []) : [];

  // Pattern 1: Procrastination
  // Tasks created but never completed, high overdue count
  const pendingTasks = tasks.filter(t => t.status === "pending" || t.status === "in_progress");
  const completedTasks = tasks.filter(t => t.status === "completed");
  const overdueTasks = pendingTasks.filter(t => {
    if (!t.due_date) return false;
    return new Date(t.due_date) < new Date();
  });

  if (overdueTasks.length >= 3) {
    patterns.push({
      type: "procrastination",
      evidence: overdueTasks.slice(0, 3).map(t => `"${t.title}" overdue since ${t.due_date}`),
      frequency: overdueTasks.length,
      lastDetected: new Date(),
      severity: overdueTasks.length >= 5 ? "high" : overdueTasks.length >= 3 ? "medium" : "low",
    });
  }

  // Pattern 2: Overplanning
  // High ratio of pending tasks to completed tasks, many goals with low progress
  const taskCreationRate = tasks.length;
  const taskCompletionRate = completedTasks.length;
  const completionRatio = taskCreationRate > 0 ? taskCompletionRate / taskCreationRate : 1;

  if (completionRatio < 0.3 && taskCreationRate >= 10) {
    patterns.push({
      type: "overplanning",
      evidence: [
        `${taskCreationRate} tasks created, only ${taskCompletionRate} completed`,
        `${(completionRatio * 100).toFixed(0)}% completion rate`,
        "High planning activity, low execution activity",
      ],
      frequency: taskCreationRate,
      lastDetected: new Date(),
      severity: completionRatio < 0.2 ? "high" : "medium",
    });
  }

  // Pattern 3: Idea Switching
  // Multiple goals created and abandoned without completion
  const abandonedGoals = goals.filter(g => g.status === "abandoned" || g.status === "paused");
  const activeGoals = goals.filter(g => g.status === "active");
  const lowProgressGoals = activeGoals.filter(g => (g.progress || 0) < 10);

  if (abandonedGoals.length >= 2 || lowProgressGoals.length >= 3) {
    patterns.push({
      type: "idea_switching",
      evidence: [
        `${abandonedGoals.length} abandoned goals`,
        `${lowProgressGoals.length} active goals with <10% progress`,
        "Multiple goal shifts without completion",
      ],
      frequency: abandonedGoals.length + lowProgressGoals.length,
      lastDetected: new Date(),
      severity: abandonedGoals.length >= 3 ? "high" : "medium",
    });
  }

  // Pattern 4: Perfectionism
  // Goals or tasks that are repeatedly updated but never completed
  // High progress goals that never reach 100%
  const highProgressStuckGoals = activeGoals.filter(g => {
    const progress = g.progress || 0;
    const createdAt = new Date(g.created_at);
    const daysSinceCreated = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
    return progress >= 80 && progress < 100 && daysSinceCreated >= 14;
  });

  if (highProgressStuckGoals.length >= 1) {
    patterns.push({
      type: "perfectionism",
      evidence: highProgressStuckGoals.map(g => `"${g.title}" stuck at ${g.progress}% for weeks`),
      frequency: highProgressStuckGoals.length,
      lastDetected: new Date(),
      severity: highProgressStuckGoals.length >= 2 ? "high" : "medium",
    });
  }

  // Pattern 5: Fear-based avoidance
  // Commitments with very low consistency scores, high "times_broken"
  const brokenCommitments = commitments.filter(c => {
    const score = Number(c.consistency_score) || 0;
    const broken = Number(c.times_broken) || 0;
    return broken >= 3 && score < 30;
  });

  if (brokenCommitments.length >= 2) {
    patterns.push({
      type: "fear_based_avoidance",
      evidence: brokenCommitments.slice(0, 3).map(c => `"${c.description}" broken ${c.times_broken} times`),
      frequency: brokenCommitments.length,
      lastDetected: new Date(),
      severity: brokenCommitments.length >= 3 ? "high" : "medium",
    });
  }

  return patterns;
}

/**
 * Generate follow-up questions based on commitments and patterns
 */
export async function generateFollowUpQuestions(
  userId: string,
  lifeContext: LifeContext
): Promise<string[]> {
  const questions: string[] = [];

  // Follow up on overdue tasks
  const overdueTasks = lifeContext.accountabilityItems.filter(
    item => item.type === "task" && item.status === "overdue"
  );

  if (overdueTasks.length > 0) {
    const task = overdueTasks[0];
    questions.push(
      `You mentioned wanting to ${task.description}${task.daysOverdue ? ` ${task.daysOverdue} days ago` : ""}. What blocked progress?`
    );
  }

  // Follow up on missed commitments
  const missedCommitments = lifeContext.accountabilityItems.filter(
    item => item.type === "commitment" && item.status === "missed"
  );

  if (missedCommitments.length > 0 && questions.length < 2) {
    questions.push(
      `You've missed some commitments recently. What's making it hard to follow through?`
    );
  }

  // Detect patterns and generate questions
  const patterns = await detectAccountabilityPatterns(userId);
  
  for (const pattern of patterns) {
    if (pattern.severity === "high" && questions.length < 3) {
      switch (pattern.type) {
        case "procrastination":
          questions.push("You seem to shift into planning mode whenever execution becomes uncomfortable. What's really holding you back?");
          break;
        case "overplanning":
          questions.push("You've spent more time creating plans than completing them. What would it take to just start?");
          break;
        case "perfectionism":
          questions.push("You keep refining instead of shipping. What would 'good enough' look like here?");
          break;
        case "idea_switching":
          questions.push("You've started several things without finishing. What makes you jump to the next idea?");
          break;
        case "fear_based_avoidance":
          questions.push("You keep avoiding this commitment. What are you afraid will happen if you do it?");
          break;
      }
    }
  }

  return questions.slice(0, 3); // Maximum 3 follow-up questions
}

/**
 * Record an accountability event (follow-through or miss)
 */
export async function recordAccountabilityEvent(params: {
  userId: string;
  commitmentId?: string;
  taskId?: string;
  action: "followed_through" | "missed" | "partial" | "rescheduled";
  aiObservation?: string;
  userResponse?: string;
}): Promise<void> {
  try {
    const supabase = await createServiceRoleClient();

    await supabase.from("accountability_log").insert({
      user_id: params.userId,
      commitment_id: params.commitmentId || null,
      task_id: params.taskId || null,
      action: params.action,
      ai_observation: params.aiObservation || null,
      user_response: params.userResponse || null,
    });

    // Update commitment consistency score
    if (params.commitmentId) {
      const { data: commitment } = await supabase
        .from("commitments")
        .select("times_followed_through, times_broken")
        .eq("id", params.commitmentId)
        .single();

      if (commitment) {
        const followed = (commitment.times_followed_through || 0) + (params.action === "followed_through" ? 1 : 0);
        const broken = (commitment.times_broken || 0) + (params.action === "missed" ? 1 : 0);
        const total = followed + broken;
        const consistency = total > 0 ? Math.round((followed / total) * 100) : 0;

        await supabase.from("commitments").update({
          times_followed_through: followed,
          times_broken: broken,
          consistency_score: consistency,
        }).eq("id", params.commitmentId);
      }
    }

    // Update task status if applicable
    if (params.taskId && params.action === "followed_through") {
      await supabase.from("tasks").update({
        status: "completed",
        last_completed_at: new Date().toISOString(),
      }).eq("id", params.taskId);
    }
  } catch (e) {
    console.error("Accountability log error:", e);
  }
}
