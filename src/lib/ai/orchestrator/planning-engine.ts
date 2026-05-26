/**
 * Planning Engine — Context-Aware Daily Planning
 * 
 * Generates daily execution plans ONLY when sufficient context exists.
 * Prevents hallucinated plans by validating context before generation.
 * 
 * Core principle: NEVER invent tasks/goals the user hasn't mentioned.
 */

import { classifyWithLLM } from "./router";
import { PLANNING_PROMPT } from "@/lib/ai/prompts";
import type { LifeContext, ContextRichness } from "./types";

export interface DailyPlanResult {
  canGenerate: boolean;
  reason?: string;
  questionsToAsk?: string[];
  plan?: DailyPlan;
}

export interface DailyPlan {
  focusAreas: string[];
  tasks: DailyTask[];
  aiInsight: string;
  recoveryNote?: string;
  contextUsed: {
    goalsCount: number;
    tasksCount: number;
    commitmentsCount: number;
  };
}

export interface DailyTask {
  title: string;
  priority: "high" | "medium" | "low";
  timeBlock?: "morning" | "afternoon" | "evening";
  estimatedMinutes?: number;
  source: string; // "goal:id" or "task:id" or "commitment:id"
}

/**
 * Validate if we have sufficient context to generate a daily plan
 */
export async function canGeneratePlan(
  userId: string,
  lifeContext: LifeContext | null,
  contextRichness: ContextRichness
): Promise<DailyPlanResult> {
  // No context at all
  if (!lifeContext || contextRichness.level === "LOW") {
    return {
      canGenerate: false,
      reason: "Insufficient context about user's goals and priorities",
      questionsToAsk: [
        "What are the main things you're trying to move forward right now?",
        "What matters most to you currently?",
        "What do you want to accomplish in the next few weeks?",
      ],
    };
  }

  // Check for active goals
  const hasGoals = (lifeContext.activeGoals?.length || 0) > 0;
  const hasTasks = (lifeContext.pendingTasks?.length || 0) > 0;
  const hasCommitments = (lifeContext.activeCommitments?.length || 0) > 0;

  // Need at least goals or commitments
  if (!hasGoals && !hasCommitments) {
    return {
      canGenerate: false,
      reason: "No known goals or commitments to plan around",
      questionsToAsk: [
        "What are you working on right now?",
        "What commitments have you made to yourself?",
      ],
    };
  }

  // Moderate context - can generate but should verify
  if (contextRichness.level === "MODERATE") {
    return {
      canGenerate: true,
      reason: "Moderate context available - will use known goals/tasks",
    };
  }

  // High context - good to go
  return {
    canGenerate: true,
    reason: "Rich context available for personalized planning",
  };
}

/**
 * Generate a daily plan based on user's life context
 * ONLY call this after validating context with canGeneratePlan
 */
export async function generateDailyPlan(
  userId: string,
  lifeContext: LifeContext,
  contextRichness: ContextRichness,
  userMessage: string
): Promise<DailyPlan> {
  // Build context summary for the LLM
  const contextSummary = buildContextSummary(lifeContext);

  // Build the planning prompt
  const planningPrompt = `${PLANNING_PROMPT}

${contextSummary}

User request: "${userMessage}"

CRITICAL RULES:
1. ONLY use tasks/goals from the context above
2. DO NOT invent new tasks like "outreach emails" or "work on MVP" unless they're in the context
3. If you don't have enough context, say so - don't make up tasks
4. Be specific - reference actual goal titles and task descriptions
5. Maximum 5-7 tasks to prevent overwhelm
6. Front-load high-priority items in morning
7. Include recovery time if momentum score is low or signs of burnout

Generate the plan now (JSON format only):`;

  try {
    const raw = await classifyWithLLM(planningPrompt, "");
    const parsed = JSON.parse(raw);

    // Validate the generated tasks match real context
    const validatedTasks = validateGeneratedTasks(parsed.tasks || [], lifeContext);

    return {
      focusAreas: Array.isArray(parsed.focusAreas) ? parsed.focusAreas.slice(0, 3) : [],
      tasks: validatedTasks,
      aiInsight: typeof parsed.aiInsight === "string" ? parsed.aiInsight : "Focus on execution today.",
      recoveryNote: parsed.recoveryNote && typeof parsed.recoveryNote === "string" ? parsed.recoveryNote : undefined,
      contextUsed: {
        goalsCount: lifeContext.activeGoals?.length || 0,
        tasksCount: lifeContext.pendingTasks?.length || 0,
        commitmentsCount: lifeContext.activeCommitments?.length || 0,
      },
    };
  } catch (e) {
    console.error("Planning generation error:", e);
    // Fallback to simple plan from tasks
    return buildFallbackPlan(lifeContext);
  }
}

/**
 * Build a context summary for the planning LLM
 */
function buildContextSummary(lifeContext: LifeContext): string {
  const parts: string[] = [];

  // Active goals
  if (lifeContext.activeGoals && lifeContext.activeGoals.length > 0) {
    parts.push("ACTIVE GOALS:");
    lifeContext.activeGoals.slice(0, 5).forEach((goal) => {
      parts.push(`- ${goal.title} (${goal.category}, ${goal.priority} priority, ${goal.progress}% done)`);
    });
  }

  // Pending tasks
  if (lifeContext.pendingTasks && lifeContext.pendingTasks.length > 0) {
    parts.push("\nPENDING TASKS:");
    lifeContext.pendingTasks.slice(0, 10).forEach((task) => {
      const dueDate = task.dueDate ? ` [Due: ${task.dueDate}]` : "";
      parts.push(`- ${task.title}${dueDate}`);
    });
  }

  // Active commitments
  if (lifeContext.activeCommitments && lifeContext.activeCommitments.length > 0) {
    parts.push("\nACTIVE COMMITMENTS:");
    lifeContext.activeCommitments.slice(0, 5).forEach((commitment) => {
      const consistency = commitment.consistencyScore ? ` (${commitment.consistencyScore}% consistent)` : "";
      parts.push(`- ${commitment.description}${consistency}`);
    });
  }

  // Momentum score
  parts.push(`\nCURRENT MOMENTUM: ${lifeContext.momentumScore}/100`);

  // Accountability items
  if (lifeContext.accountabilityItems && lifeContext.accountabilityItems.length > 0) {
    parts.push("\nOVERDUE/MISSED:");
    lifeContext.accountabilityItems.slice(0, 3).forEach((item) => {
      const overdue = item.daysOverdue ? ` (${item.daysOverdue} days overdue)` : "";
      parts.push(`- ${item.description}${overdue}`);
    });
  }

  return parts.join("\n");
}

/**
 * Validate that generated tasks match real user context
 * Filter out hallucinated tasks
 */
function validateGeneratedTasks(
  tasks: Array<Record<string, unknown>>,
  lifeContext: LifeContext
): DailyTask[] {
  const validated: DailyTask[] = [];

  for (const task of tasks) {
    const title = String(task.title || "").trim();
    if (!title) continue;

    // Try to match task to a real goal or task
    const matchedGoal = lifeContext.activeGoals?.find(g =>
      title.toLowerCase().includes(g.title.toLowerCase()) ||
      g.title.toLowerCase().includes(title.toLowerCase())
    );

    const matchedTask = lifeContext.pendingTasks?.find(t =>
      title.toLowerCase().includes(t.title.toLowerCase()) ||
      t.title.toLowerCase().includes(title.toLowerCase())
    );

    const matchedCommitment = lifeContext.activeCommitments?.find(c =>
      title.toLowerCase().includes(c.description.toLowerCase().slice(0, 30)) ||
      c.description.toLowerCase().includes(title.toLowerCase())
    );

    // Only include if we can match to real context
    if (matchedGoal || matchedTask || matchedCommitment) {
      validated.push({
        title,
        priority: ["high", "medium", "low"].includes(String(task.priority)) ? String(task.priority) as "high" | "medium" | "low" : "medium",
        timeBlock: ["morning", "afternoon", "evening"].includes(String(task.timeBlock)) ? String(task.timeBlock) as "morning" | "afternoon" | "evening" : undefined,
        estimatedMinutes: typeof task.estimatedMinutes === "number" ? task.estimatedMinutes : undefined,
        source: matchedTask ? `task:${matchedTask.id}` : matchedGoal ? `goal:${matchedGoal.id}` : `commitment:${matchedCommitment?.id}`,
      });
    } else {
      console.warn("Filtering out potentially hallucinated task:", title);
    }
  }

  return validated;
}

/**
 * Build a simple fallback plan from existing tasks
 */
function buildFallbackPlan(lifeContext: LifeContext): DailyPlan {
  const tasks: DailyTask[] = [];

  // Add top priority pending tasks
  if (lifeContext.pendingTasks && lifeContext.pendingTasks.length > 0) {
    const topTasks = lifeContext.pendingTasks
      .slice(0, 5)
      .map(t => ({
        title: t.title,
        priority: "medium" as const,
        timeBlock: undefined,
        estimatedMinutes: undefined,
        source: `task:${t.id}`,
      }));
    tasks.push(...topTasks);
  }

  // Add focus areas from goals
  const focusAreas: string[] = [];
  if (lifeContext.activeGoals && lifeContext.activeGoals.length > 0) {
    focusAreas.push(...lifeContext.activeGoals.slice(0, 2).map(g => g.title));
  }

  return {
    focusAreas,
    tasks,
    aiInsight: "Focus on completing your pending tasks.",
    contextUsed: {
      goalsCount: lifeContext.activeGoals?.length || 0,
      tasksCount: lifeContext.pendingTasks?.length || 0,
      commitmentsCount: lifeContext.activeCommitments?.length || 0,
    },
  };
}

/**
 * Detect if user is requesting a plan
 */
export function isPlanningRequest(message: string): boolean {
  const planningKeywords = [
    "plan my day",
    "plan my week",
    "daily plan",
    "weekly plan",
    "what should i do today",
    "what should i focus on",
    "help me prioritize",
    "schedule my day",
    "organize my day",
  ];

  const lower = message.toLowerCase();
  return planningKeywords.some(keyword => lower.includes(keyword));
}
