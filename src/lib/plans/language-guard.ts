export interface PlanEvidenceInput {
  initiatives: string[];
  upcomingDeadlines: string[];
  recentProgress: string[];
  recentReflections: string[];
  opportunities: string[];
  executionRate7d: number;
}

const HEDGE_PREFIX = "Based on the information available, ";
const HEDGE_MARKERS = /^(based on|from what|given the|it appears|your data suggests|limited context)/i;

/** Qualitative label shown to users instead of raw % when context is thin. */
export function confidenceDisplayLabel(score: number): string {
  if (score >= 70) return "Strong context";
  if (score >= 40) return "Moderate context";
  return "Limited context";
}

export function isLowPlanConfidence(score: number): boolean {
  return score < 40;
}

export function applyPlanLanguageGuard(
  text: string | undefined,
  confidenceScore: number
): string | undefined {
  if (!text?.trim()) return text;
  if (!isLowPlanConfidence(confidenceScore)) return text.trim();

  let trimmed = text.trim();
  if (HEDGE_MARKERS.test(trimmed)) return trimmed;

  trimmed = trimmed.replace(
    /^you('re| are) (focused on|building|working toward|trying to)/i,
    "your current goals suggest an interest in"
  );

  const lower = trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
  return `${HEDGE_PREFIX}${lower}`;
}

export function buildPlanEvidence(ctx: PlanEvidenceInput): string[] {
  const evidence: string[] = [];

  if (ctx.initiatives.length > 0) {
    evidence.push(`${ctx.initiatives.length} active initiative(s) on file`);
  } else {
    evidence.push("No active initiatives with deadlines yet");
  }

  if (ctx.upcomingDeadlines.length > 0) {
    evidence.push(
      `${ctx.upcomingDeadlines.length} upcoming deadline(s): ${ctx.upcomingDeadlines.slice(0, 2).join("; ")}`
    );
  }

  if (ctx.recentProgress.length > 0) {
    evidence.push(`${ctx.recentProgress.length} task(s) completed in the last 7 days`);
  } else {
    evidence.push("No completed tasks in the last 7 days");
  }

  evidence.push(`7-day execution rate on planned tasks: ${ctx.executionRate7d}%`);

  if (ctx.recentReflections.length > 0) {
    evidence.push(`${ctx.recentReflections.length} daily reflection(s) logged recently`);
  } else {
    evidence.push("No daily reflections logged yet");
  }

  if (ctx.opportunities.length > 0) {
    evidence.push(`${ctx.opportunities.length} active opportunity/opportunities noted`);
  }

  return evidence;
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
            ? `7-day execution rate: ${executionRate7d}%`
            : "No completed planned tasks in the last 7 days",
          "Add initiatives and log reflections for clearer momentum signals",
        ];

  const headlines: Record<string, string> = {
    surging: "Based on recent activity, momentum looks strong",
    building: "Based on recent activity, momentum is building",
    steady: "Based on available data, progress looks steady",
    slowing: "Based on available data, momentum may be slowing",
    stalled: "Based on limited activity data, momentum appears stalled",
  };

  return {
    headline: headlines[label] || `Momentum: ${label}`,
    evidence,
  };
}
