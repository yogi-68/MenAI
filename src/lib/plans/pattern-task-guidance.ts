/**
 * Task-generation guidance per execution pattern.
 *
 * Keyed by `ExecutionPattern`, so adding a pattern to the vocabulary without
 * guidance for it is a compile error rather than a silent gap. Two entries
 * used to sit here for patterns that could not exist: `reactive_schedule`,
 * which the database CHECK constraint rejected, and `distraction`, which was
 * never in the vocabulary at all. Neither could ever be selected.
 */

import { isExecutionPattern, type ExecutionPattern } from "@/lib/patterns/vocabulary";

export interface PatternGuidance {
  pattern: ExecutionPattern;
  avoidTasks: string[];
  preferTasks: string[];
  coachNote: string;
}

const GUIDANCE: Record<ExecutionPattern, PatternGuidance> = {
  overthinking: {
    pattern: "overthinking",
    avoidTasks: ["research competitors", "read more articles", "plan further", "compare options"],
    preferTasks: ["talk to 1 potential user", "ship a rough draft", "send 1 outreach message", "make one decision and act"],
    coachNote: "User overthinks — bias toward action and conversation, not research.",
  },
  procrastination: {
    pattern: "procrastination",
    avoidTasks: ["start big project", "full overhaul"],
    preferTasks: ["complete the smallest next step in 25 minutes", "open the doc and write 3 bullets", "send 1 message you've delayed"],
    coachNote: "User procrastinates — tasks must be tiny and time-boxed.",
  },
  perfectionism: {
    pattern: "perfectionism",
    avoidTasks: ["polish until perfect", "redesign from scratch"],
    preferTasks: ["publish draft v1", "ship good-enough version", "get feedback on rough work"],
    coachNote: "Perfectionism blocks shipping — tasks should explicitly allow 'good enough'.",
  },
  inconsistency: {
    pattern: "inconsistency",
    avoidTasks: ["ambitious multi-hour blocks"],
    preferTasks: ["repeat yesterday's smallest win", "20-minute consistency task", "same time block as last success"],
    coachNote: "Inconsistency — same small action daily beats big sporadic pushes.",
  },
  avoidance: {
    pattern: "avoidance",
    avoidTasks: ["more planning around the hard thing"],
    preferTasks: ["do the avoided task for 15 minutes only", "send the message you've been avoiding"],
    coachNote: "Avoidance — name and shrink the avoided task.",
  },
  scattered_focus: {
    pattern: "scattered_focus",
    avoidTasks: [
      "work on multiple initiatives",
      "parallel projects",
      "schedule more meetings",
      "plan around the calendar",
      "browse without purpose",
    ],
    // Absorbed from the former reactive_schedule and distraction entries: a
    // calendar owned by other people, and an attention pulled elsewhere, are
    // both causes of the same scattering, and the remedies are the same kind.
    preferTasks: [
      "one task on the current focus only",
      "defer everything else explicitly",
      "protect a 90-minute focus block tomorrow",
      "decline or shorten one meeting",
      "batch email and calls into one slot",
      "phone in another room for 45 minutes",
    ],
    coachNote:
      "Scattered focus — one initiative gets tasks today; protect a deep block and shrink the calendar.",
  },
  burnout: {
    pattern: "burnout",
    avoidTasks: ["long grind sessions", "stack 5 hard tasks"],
    preferTasks: ["one essential task under 45 min", "20-minute walk", "protect sleep routine tonight"],
    coachNote: "Burnout signals — shorter tasks, recovery included.",
  },
};

export function buildPatternGuidanceLines(
  patterns: Array<{
    pattern: string;
    behavioral_impact?: string | null;
    severity?: string | null;
    confidence?: number | null;
    occurrences?: number | null;
  }>
): string[] {
  const lines: string[] = [];
  for (const p of patterns) {
    // Rows predating migration 045 may hold a value outside the vocabulary;
    // fall through to behavioral_impact rather than indexing with it.
    const g = isExecutionPattern(p.pattern) ? GUIDANCE[p.pattern] : undefined;
    const stats =
      p.confidence != null || p.occurrences != null
        ? ` [confidence ${Math.round((p.confidence ?? 0.7) * 100)}%, mentions ${p.occurrences ?? 1}]`
        : "";
    if (g) {
      lines.push(
        `${g.pattern}${stats} (${p.severity || "medium"}): ${g.coachNote} AVOID: ${g.avoidTasks.join(", ")}. PREFER: ${g.preferTasks.join(", ")}.`
      );
    } else if (p.behavioral_impact) {
      lines.push(`${p.pattern}${stats}: ${p.behavioral_impact}`);
    }
  }
  return lines;
}

/**
 * Guidance for one pattern, or undefined if it is not in the vocabulary.
 *
 * The map is keyed by `ExecutionPattern`, so callers holding a narrowed value
 * can index it directly; this exists for callers holding a plain string, such
 * as a row written before migration 045 normalized the column.
 */
export function patternGuidanceFor(pattern: string): PatternGuidance | undefined {
  return isExecutionPattern(pattern) ? GUIDANCE[pattern] : undefined;
}

export function getNextMilestoneTitle(
  milestones: Array<{ title: string; status: string; sort_order: number }>
): string | null {
  const sorted = [...milestones].sort((a, b) => a.sort_order - b.sort_order);
  const next = sorted.find((m) => m.status !== "completed");
  return next?.title ?? null;
}
