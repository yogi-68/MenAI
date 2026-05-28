/**
 * Task Evolution Engine — Adaptive Task Intelligence
 *
 * Tasks don't just exist. They ADAPT.
 *
 * When a user keeps skipping a task, MenAI doesn't nag.
 * It dowscopes, reframes, or deprioritizes automatically.
 *
 * Examples:
 *   "Build landing page"  →  "Finish only the hero section today"
 *   "Workout 2 hours"     →  "Just restart the routine. Intensity matters less than consistency."
 *   "Read 50 pages"       →  "Read for 10 minutes. Momentum beats volume."
 *
 * This engine runs:
 *   1. On task generation (to pre-adapt based on cognitive state)
 *   2. On nightly synthesis (to evolve stale/skipped tasks)
 *   3. On explicit user request
 */

import { createServiceRoleClient } from "@/lib/supabase/server";
import type { CognitiveState } from "./cognition-engine";

export interface TaskEvolution {
  task_id: string;
  original_title: string;
  evolved_title: string;
  evolution_reason: EvolutionReason;
  applied: boolean;
}

export type EvolutionReason =
  | "repeatedly_skipped"
  | "too_large"
  | "energy_mismatch"
  | "overdue_decomposition"
  | "momentum_adjustment"
  | "burnout_protection";

/**
 * Evolve tasks based on the user's current cognitive state.
 * Returns a list of proposed task evolutions.
 */
export async function evolveStalesTasks(
  userId: string,
  cognitiveState: CognitiveState,
): Promise<TaskEvolution[]> {
  const supabase = await createServiceRoleClient();

  // Get tasks that need evolution
  const today = new Date().toISOString().split("T")[0];

  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title, description, status, due_date, estimated_minutes, created_at, skip_count")
    .eq("user_id", userId)
    .in("status", ["pending", "in_progress"])
    .order("created_at", { ascending: true })
    .limit(20);

  if (!tasks || tasks.length === 0) return [];

  const evolutions: TaskEvolution[] = [];

  for (const task of tasks) {
    const evolution = _evaluateTaskForEvolution(task, cognitiveState, today);
    if (evolution) {
      evolutions.push(evolution);
    }
  }

  return evolutions;
}

/**
 * Apply approved task evolutions to the database.
 */
export async function applyTaskEvolutions(
  userId: string,
  evolutions: TaskEvolution[],
): Promise<number> {
  const supabase = await createServiceRoleClient();
  let applied = 0;

  for (const evo of evolutions) {
    const { error } = await supabase
      .from("tasks")
      .update({
        title: evo.evolved_title,
        description: `[Adapted] Original: "${evo.original_title}". Reason: ${_formatEvolutionReason(evo.evolution_reason)}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", evo.task_id)
      .eq("user_id", userId);

    if (!error) {
      applied++;
    }
  }

  return applied;
}

/**
 * Auto-evolve and apply. Called by synthesis worker.
 */
export async function autoEvolveAndApply(
  userId: string,
  cognitiveState: CognitiveState,
): Promise<{ proposed: number; applied: number }> {
  const evolutions = await evolveStalesTasks(userId, cognitiveState);

  if (evolutions.length === 0) {
    return { proposed: 0, applied: 0 };
  }

  // Auto-apply only safe evolutions (not removing tasks, just reframing)
  const applied = await applyTaskEvolutions(userId, evolutions);

  console.log(`[TaskEvolution] User ${userId}: ${evolutions.length} proposed, ${applied} applied`);

  return { proposed: evolutions.length, applied };
}

// ===== INTERNAL LOGIC =====

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  due_date: string | null;
  estimated_minutes: number | null;
  created_at: string;
  skip_count?: number;
}

function _evaluateTaskForEvolution(
  task: TaskRow,
  state: CognitiveState,
  today: string,
): TaskEvolution | null {
  const daysOld = Math.floor((Date.now() - new Date(task.created_at).getTime()) / (1000 * 60 * 60 * 24));
  const isOverdue = task.due_date && task.due_date < today;
  const skipCount = task.skip_count || 0;

  // 1. Repeatedly skipped tasks — downscope
  if (skipCount >= 3) {
    return {
      task_id: task.id,
      original_title: task.title,
      evolved_title: _downscopeTask(task.title),
      evolution_reason: "repeatedly_skipped",
      applied: false,
    };
  }

  // 2. Overdue for more than 3 days — decompose
  if (isOverdue && task.due_date) {
    const daysOverdue = Math.floor((new Date(today).getTime() - new Date(task.due_date).getTime()) / (1000 * 60 * 60 * 24));
    if (daysOverdue >= 3) {
      return {
        task_id: task.id,
        original_title: task.title,
        evolved_title: _decomposeLargeTask(task.title),
        evolution_reason: "overdue_decomposition",
        applied: false,
      };
    }
  }

  // 3. Energy mismatch — lighten tasks when user is depleted
  if (
    (state.energy_state === "depleted" || state.energy_state === "low") &&
    (task.estimated_minutes && task.estimated_minutes > 60)
  ) {
    return {
      task_id: task.id,
      original_title: task.title,
      evolved_title: _lightenTask(task.title),
      evolution_reason: "energy_mismatch",
      applied: false,
    };
  }

  // 4. Burnout protection — reduce load when burnout detected
  if (state.detected_weaknesses.some(w => w.type === "burnout") && daysOld > 3) {
    return {
      task_id: task.id,
      original_title: task.title,
      evolved_title: _gentleTask(task.title),
      evolution_reason: "burnout_protection",
      applied: false,
    };
  }

  // 5. Task too large (> 2 hours estimated) and momentum is declining
  if (
    task.estimated_minutes && task.estimated_minutes > 120 &&
    (state.momentum_state === "declining" || state.momentum_state === "stalling")
  ) {
    return {
      task_id: task.id,
      original_title: task.title,
      evolved_title: _decomposeLargeTask(task.title),
      evolution_reason: "too_large",
      applied: false,
    };
  }

  return null;
}

// ===== TASK REWRITING HEURISTICS =====
// These are rule-based. Future: use LLM for smarter rewrites.

function _downscopeTask(title: string): string {
  const lower = title.toLowerCase();

  // Common patterns
  if (lower.includes("build") || lower.includes("create")) {
    return `Start the first piece of: ${title.toLowerCase()}`;
  }
  if (lower.includes("write")) {
    return `Write the first paragraph for: ${title.toLowerCase()}`;
  }
  if (lower.includes("plan") || lower.includes("design")) {
    return `Rough sketch only: ${title.toLowerCase()}`;
  }
  if (lower.includes("workout") || lower.includes("exercise") || lower.includes("gym")) {
    return "Just restart the routine today. Intensity matters less than consistency right now.";
  }
  if (lower.includes("read")) {
    return "Read for 10 minutes. Momentum beats volume.";
  }
  if (lower.includes("study") || lower.includes("learn")) {
    return `Review just one concept from: ${title.toLowerCase()}`;
  }

  // Generic downscope
  return `Just the smallest first step on: ${title.toLowerCase()}`;
}

function _decomposeLargeTask(title: string): string {
  const lower = title.toLowerCase();

  if (lower.includes("landing page") || lower.includes("website")) {
    return "Finish only the hero section today";
  }
  if (lower.includes("presentation") || lower.includes("deck")) {
    return "Outline the 3 main slides. Don't polish yet.";
  }
  if (lower.includes("report") || lower.includes("document")) {
    return "Write the executive summary only";
  }

  return `Break this down: What's the single next action for "${title}"?`;
}

function _lightenTask(title: string): string {
  return `Lighter version: ${title.toLowerCase()} (reduced scope — you need recovery today)`;
}

function _gentleTask(title: string): string {
  return `When you have energy: ${title.toLowerCase()} — no pressure today`;
}

function _formatEvolutionReason(reason: EvolutionReason): string {
  const reasons: Record<EvolutionReason, string> = {
    repeatedly_skipped: "This task was skipped multiple times. Downscoped to build momentum.",
    too_large: "Task scope was too large for current momentum. Broken into a smaller piece.",
    energy_mismatch: "Energy is low. Task lightened to match current capacity.",
    overdue_decomposition: "Task was overdue. Decomposed into a manageable first step.",
    momentum_adjustment: "Adjusted to match current execution rhythm.",
    burnout_protection: "Burnout signals detected. Task softened to protect recovery.",
  };
  return reasons[reason] || "Adapted based on behavioral signals.";
}
