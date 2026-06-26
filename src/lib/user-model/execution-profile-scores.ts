/** Map execution patterns + identity signals to 5-axis radar scores (0–100). */

export interface ExecutionProfileScores {
  focus: number;
  consistency: number;
  clarity: number;
  momentum: number;
  openness: number;
}

interface PatternRow {
  pattern: string;
  behavioral_impact?: string | null;
  confidence?: number | null;
  occurrences?: number | null;
}

interface IdentitySignal {
  description: string;
  long_term_direction?: string | null;
}

const PATTERN_AXIS: Record<string, keyof ExecutionProfileScores> = {
  lack_of_time: "focus",
  procrastination: "momentum",
  overthinking: "focus",
  perfectionism: "focus",
  lack_of_clarity: "clarity",
  fear_of_failure: "openness",
  inconsistency: "consistency",
  distraction: "focus",
  low_energy: "momentum",
  lack_of_accountability: "consistency",
};

function clamp(n: number): number {
  return Math.max(20, Math.min(95, Math.round(n)));
}

export function deriveExecutionProfileScores(
  patterns: PatternRow[],
  identitySignals: IdentitySignal[],
  opts?: { hasRecentActivity?: boolean; confidence?: string | null; stillNeedsCount?: number }
): ExecutionProfileScores {
  const scores: ExecutionProfileScores = {
    focus: 62,
    consistency: 58,
    clarity: 55,
    momentum: 50,
    openness: 60,
  };

  for (const p of patterns) {
    const axis = PATTERN_AXIS[p.pattern];
    if (!axis) continue;
    const conf = p.confidence ?? 0.7;
    const occ = p.occurrences ?? 1;
    const penalty = Math.min(35, occ * 4 + conf * 15);
    scores[axis] = clamp(scores[axis] - penalty);
  }

  if (identitySignals.length >= 3) {
    scores.clarity = clamp(scores.clarity + 12);
    scores.openness = clamp(scores.openness + 8);
  } else if (identitySignals.length >= 1) {
    scores.clarity = clamp(scores.clarity + 6);
  }

  if (opts?.hasRecentActivity) {
    scores.momentum = clamp(scores.momentum + 18);
    scores.consistency = clamp(scores.consistency + 10);
  }

  if (opts?.confidence === "high") scores.clarity = clamp(scores.clarity + 15);
  else if (opts?.confidence === "moderate") scores.clarity = clamp(scores.clarity + 8);

  if (opts?.stillNeedsCount != null && opts.stillNeedsCount <= 1) {
    scores.openness = clamp(scores.openness + 12);
  }

  return scores;
}
