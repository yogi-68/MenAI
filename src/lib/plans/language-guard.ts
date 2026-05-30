import { sanitizeCoachText } from "@/lib/plans/coach-insights";

export interface PlanEvidenceInput {
  initiatives: string[];
  upcomingDeadlines: string[];
  recentProgress: string[];
  recentReflections: string[];
  opportunities: string[];
  executionRate7d: number;
}

export function isLowPlanConfidence(score: number): boolean {
  return score < 40;
}

/** @deprecated Use sanitizeCoachText from coach-insights */
export function applyPlanLanguageGuard(
  text: string | undefined,
  _confidenceScore: number,
  coachContext?: { userGoal?: string; missingVariables?: string[] }
): string | undefined {
  return sanitizeCoachText(text, coachContext || {});
}

export function buildPlanEvidence(ctx: PlanEvidenceInput): string[] {
  const evidence: string[] = [];

  if (ctx.recentProgress.length > 0) {
    evidence.push(`Recent execution: ${ctx.recentProgress.slice(0, 2).join("; ")}`);
  } else {
    evidence.push("No completed tasks in the last 7 days — plans are based on setup, not behavior yet");
  }

  if (ctx.recentReflections.length > 0) {
    evidence.push(`Latest reflection context available`);
  }

  if (ctx.upcomingDeadlines.length > 0) {
    evidence.push(`Deadline pressure: ${ctx.upcomingDeadlines[0]}`);
  }

  if (ctx.initiatives.length > 0 && ctx.recentProgress.length === 0) {
    evidence.push(`Initiative "${ctx.initiatives[0]?.split(" — ")[0]}" — awaiting first completed task`);
  }

  return evidence.slice(0, 5);
}

export function formatMomentumLabel(
  label: string,
  factors: string[],
  executionRate7d: number
): { headline: string; evidence: string[] } {
  const evidence =
    factors.length > 0
      ? factors
      : [
          executionRate7d > 0
            ? `${executionRate7d}% of planned tasks completed this week`
            : "No completed planned tasks yet — momentum unknown until you execute",
        ];

  const headlines: Record<string, string> = {
    surging: "Execution is picking up — keep the streak",
    building: "Early signals of consistency appearing",
    steady: "Pace is holding — watch for drift on deadlines",
    slowing: "Fewer completions lately — check what's blocking you",
    stalled: "No recent completions logged — MenAI needs execution data",
  };

  return {
    headline: headlines[label] || `Momentum: ${label}`,
    evidence,
  };
}
