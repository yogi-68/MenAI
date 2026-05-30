/** Map detected execution patterns to task generation guidance. */

export interface PatternGuidance {
  pattern: string;
  avoidTasks: string[];
  preferTasks: string[];
  coachNote: string;
}

const GUIDANCE: Record<string, PatternGuidance> = {
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
    avoidTasks: ["work on multiple initiatives", "parallel projects"],
    preferTasks: ["one task on current focus only", "defer everything else explicitly"],
    coachNote: "Scattered focus — only current focus initiative gets tasks today.",
  },
  burnout: {
    pattern: "burnout",
    avoidTasks: ["long grind sessions", "stack 5 hard tasks"],
    preferTasks: ["one essential task under 45 min", "20-minute walk", "protect sleep routine tonight"],
    coachNote: "Burnout signals — shorter tasks, recovery included.",
  },
};

export function buildPatternGuidanceLines(
  patterns: Array<{ pattern: string; behavioral_impact?: string | null; severity?: string | null }>
): string[] {
  const lines: string[] = [];
  for (const p of patterns) {
    const g = GUIDANCE[p.pattern];
    if (g) {
      lines.push(
        `${g.pattern} (${p.severity || "medium"}): ${g.coachNote} AVOID: ${g.avoidTasks.join(", ")}. PREFER: ${g.preferTasks.join(", ")}.`
      );
    } else if (p.behavioral_impact) {
      lines.push(`${p.pattern}: ${p.behavioral_impact}`);
    }
  }
  return lines;
}

export function getNextMilestoneTitle(
  milestones: Array<{ title: string; status: string; sort_order: number }>
): string | null {
  const sorted = [...milestones].sort((a, b) => a.sort_order - b.sort_order);
  const next = sorted.find((m) => m.status !== "completed");
  return next?.title ?? null;
}
