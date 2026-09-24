import { isVagueContextText } from "@/lib/plans/plan-confidence";
import {
  buildGoalAnalysis,
  detectDomain,
  type KnownFacts,
} from "@/lib/plans/coach-insights";

export type ContextDimensionId =
  | "goal_clarity"
  | "initiative_clarity"
  | "deadline_clarity"
  | "obstacle_clarity"
  | "available_time"
  | "recent_activity"
  // Mental-performance dimensions. These are what let the coach size a day
  // against capacity rather than issuing a fixed quota.
  | "energy_pattern"
  | "depletion_source"
  | "recovery_style"
  | "state_baseline";

export interface ContextDimension {
  id: ContextDimensionId;
  label: string;
  score: number;
  /** Expected score gain if user answers one good question (~). */
  marginalGain: number;
  satisfied: boolean;
  gapHint?: string;
}

export interface PlanContextSnapshot {
  dimensions: ContextDimension[];
  overall: number;
  planningQuality: "Strong" | "Good" | "Fair" | "Needs context";
  shouldInterview: boolean;
  stopReason?: "threshold_met" | "low_marginal_gain" | "no_gaps" | "max_questions" | "coverage_sufficient" | "no_initiatives";
}

export interface DimensionInput {
  goals: Array<{ title: string; description?: string | null }>;
  initiatives: Array<{ title: string; description?: string | null; target_date?: string | null; life_area?: string | null }>;
  patterns: Array<{ pattern: string; behavioral_impact?: string | null }>;
  recentCompletedTasks: number;
  recentReflections: Array<{ blocked_by?: string | null }>;
  planContext: {
    weeklyAvailableHours?: number | null;
    biggestObstacle?: string | null;
    initiativeOutcome90d?: string | null;
    businessFocus?: string | null;
    currentWeight?: number | null;
    currentBodyFatPct?: number | null;
    trainingDaysPerWeek?: number | null;
    studyHoursPerDay?: number | null;
    currentMetric?: string | null;
    /** When in the day the user does their best work. */
    peakEnergyWindow?: string | null;
    /** What reliably drains them. */
    depletedBy?: string | null;
    /** What actually restores them, in their own words. */
    recoveryAction?: string | null;
    interviewAskedToday?: string[];
  };
  questionsAskedToday: string[];
  /** How many state check-ins exist in the recent window. */
  recentStateCheckins?: number;
}

const STOP_OVERALL = 78;
const STOP_WEAK_DIM = 70;
const MARGINAL_GAIN_FLOOR = 8;
const MAX_QUESTIONS_PER_DAY = 5;

/**
 * Dimension metadata.
 *
 * `interviewable` marks a dimension the coach may ask about directly. Every
 * dimension was previously set to false, which meant marginalGainFor()
 * returned 0 for all of them, pickNextInterviewDimension() could never return
 * a question, and this entire engine was unreachable. Anything the user can
 * answer in a sentence is now interviewable; recent_activity is not, because
 * it is measured from behaviour rather than asked.
 *
 * Weights sum to 1.
 */
const DIMENSION_META: Record<
  ContextDimensionId,
  { label: string; gapHint: string; interviewable: boolean; weight: number }
> = {
  goal_clarity: {
    label: "Goal",
    gapHint: "Give a baseline we don't have yet — a number to measure from",
    interviewable: true,
    weight: 0.1,
  },
  initiative_clarity: {
    label: "Outcome",
    gapHint: "Add a measurable 90-day outcome",
    interviewable: true,
    weight: 0.15,
  },
  deadline_clarity: {
    label: "Deadline",
    gapHint: "Set a target date",
    interviewable: true,
    weight: 0.12,
  },
  obstacle_clarity: {
    label: "Biggest obstacle",
    gapHint: "Name what is actually blocking progress",
    interviewable: true,
    weight: 0.13,
  },
  available_time: {
    label: "Available time",
    gapHint: "Say how much time you realistically have this week",
    interviewable: true,
    weight: 0.1,
  },
  recent_activity: {
    label: "Recent activity",
    gapHint: "Finish a task or log a reflection",
    interviewable: false,
    weight: 0.05,
  },
  energy_pattern: {
    label: "Energy pattern",
    gapHint: "Tell us when in the day you think most clearly",
    interviewable: true,
    weight: 0.1,
  },
  depletion_source: {
    label: "What drains you",
    gapHint: "Name what reliably empties the tank",
    interviewable: true,
    weight: 0.1,
  },
  recovery_style: {
    label: "What restores you",
    gapHint: "Say what actually brings you back",
    interviewable: true,
    weight: 0.07,
  },
  state_baseline: {
    label: "State baseline",
    gapHint: "Log how you are for a few days",
    interviewable: false,
    weight: 0.08,
  },
};

function scoreGoalClarity(input: DimensionInput): number {
  if (input.initiatives.length === 0) return 10;
  const _init = input.initiatives[0];
  const facts = knownFactsFromInput(input);
  const missing = buildGoalAnalysis(facts).missingVariables;
  if (missing.length === 0) return 95;
  if (missing.length <= 2) return 72;
  return 45;
}

function scoreInitiativeClarity(input: DimensionInput): number {
  if (input.initiatives.length === 0) return 5;
  const init = input.initiatives[0];
  if (input.planContext.initiativeOutcome90d?.trim()) return 95;
  if (init.description && init.description.length > 20) return 88;
  if (isVagueContextText(init.title)) return 35;
  if (init.title.length > 12) return 82;
  return 60;
}

function knownFactsFromInput(input: DimensionInput): KnownFacts {
  const init = input.initiatives[0];
  return {
    domain: detectDomain(`${init?.title || ""} ${init?.description || ""}`, init?.life_area),
    initiativeTitle: init?.title,
    initiativeDescription: init?.description ?? undefined,
    targetDate: init?.target_date,
    lifeArea: init?.life_area,
    goalTexts: input.goals.map((g) => g.title),
    planContext: input.planContext as Record<string, unknown>,
  };
}

function scoreDeadlineClarity(input: DimensionInput): number {
  if (input.initiatives.length === 0) return 0;
  const withDate = input.initiatives.filter((i) => i.target_date);
  if (withDate.length === 0) return 15;
  const d = withDate[0].target_date!;
  const days = Math.floor(
    (new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  if (days > 0 && days <= 120) return 100;
  if (days > 0) return 80;
  return 50;
}

function scoreObstacleClarity(input: DimensionInput): number {
  if (input.planContext.biggestObstacle?.trim()) return 95;
  if (input.patterns.length > 0 && input.patterns[0].behavioral_impact) return 75;
  const reflectionBlock = input.recentReflections.find((r) => r.blocked_by?.trim());
  if (reflectionBlock?.blocked_by) return 65;
  return 20;
}

function scoreAvailableTime(input: DimensionInput): number {
  const h = input.planContext.weeklyAvailableHours;
  if (typeof h === "number" && h > 0) {
    if (h >= 5 && h <= 60) return 100;
    return 70;
  }
  return 15;
}

function scoreRecentActivity(input: DimensionInput): number {
  const n = input.recentCompletedTasks;
  if (n >= 5) return 95;
  if (n >= 2) return 75;
  if (n >= 1) return 55;
  return 25;
}

function scoreEnergyPattern(input: DimensionInput): number {
  const value = input.planContext.peakEnergyWindow?.trim();
  if (!value) return 20;
  return isVagueContextText(value) ? 55 : 95;
}

function scoreDepletionSource(input: DimensionInput): number {
  const value = input.planContext.depletedBy?.trim();
  if (!value) return 20;
  return isVagueContextText(value) ? 55 : 95;
}

function scoreRecoveryStyle(input: DimensionInput): number {
  const value = input.planContext.recoveryAction?.trim();
  if (!value) return 25;
  return isVagueContextText(value) ? 60 : 95;
}

/**
 * How much state history exists.
 *
 * Not interviewable: it improves by logging, not by answering. Below roughly
 * a week of readings there is not enough signal to call a trend.
 */
function scoreStateBaseline(input: DimensionInput): number {
  const n = input.recentStateCheckins ?? 0;
  if (n >= 7) return 95;
  if (n >= 4) return 75;
  if (n >= 1) return 45;
  return 15;
}

function marginalGainFor(id: ContextDimensionId, score: number): number {
  if (!DIMENSION_META[id].interviewable) return 0;
  if (score >= 85) return 0;
  if (score >= 70) return 6;
  if (score >= 45) return 14;
  return 22;
}

export function computeContextDimensions(input: DimensionInput): ContextDimension[] {
  const scores: Record<ContextDimensionId, number> = {
    goal_clarity: scoreGoalClarity(input),
    initiative_clarity: scoreInitiativeClarity(input),
    deadline_clarity: scoreDeadlineClarity(input),
    obstacle_clarity: scoreObstacleClarity(input),
    available_time: scoreAvailableTime(input),
    recent_activity: scoreRecentActivity(input),
    energy_pattern: scoreEnergyPattern(input),
    depletion_source: scoreDepletionSource(input),
    recovery_style: scoreRecoveryStyle(input),
    state_baseline: scoreStateBaseline(input),
  };

  return (Object.keys(scores) as ContextDimensionId[]).map((id) => {
    const score = scores[id];
    const meta = DIMENSION_META[id];
    return {
      id,
      label: meta.label,
      score,
      marginalGain: marginalGainFor(id, score),
      satisfied: score >= 70,
      gapHint: score >= 70 ? undefined : meta.gapHint,
    };
  });
}

export function overallFromDimensions(dimensions: ContextDimension[]): number {
  let total = 0;
  let weight = 0;
  for (const d of dimensions) {
    const w = DIMENSION_META[d.id].weight;
    total += d.score * w;
    weight += w;
  }
  return Math.round(total / weight);
}

export function planningQualityLabel(
  overall: number
): PlanContextSnapshot["planningQuality"] {
  if (overall >= 85) return "Strong";
  if (overall >= 72) return "Good";
  if (overall >= 50) return "Fair";
  return "Needs context";
}

/**
 * Decide whether to ask a question, and why not if not.
 *
 * One rule, evaluated in order. This previously had two competing blocks: a
 * dimension-based decision, immediately overridden by a second block keyed off
 * buildGoalAnalysis().missingVariables. With every dimension marked
 * un-interviewable the first block could never fire anyway, so the override
 * was the only live path — and it could only ever ask about goal variables,
 * never about the dimensions this module exists to score.
 *
 * The ordering matters: the daily cap comes first so that a user who has
 * already answered five questions is never asked a sixth, whatever the gaps.
 */
export function buildPlanContextSnapshot(input: DimensionInput): PlanContextSnapshot {
  const dimensions = computeContextDimensions(input);
  const overall = overallFromDimensions(dimensions);
  const quality = planningQualityLabel(overall);
  const asked = input.questionsAskedToday ?? [];

  const candidates = dimensions.filter(
    (d) =>
      DIMENSION_META[d.id].interviewable &&
      !asked.includes(d.id) &&
      d.marginalGain >= MARGINAL_GAIN_FLOOR
  );

  // Goal variables are tracked separately by buildGoalAnalysis and can also
  // justify a question, so they count toward "is anything missing".
  const missingGoalVariables =
    input.initiatives.length > 0
      ? buildGoalAnalysis(knownFactsFromInput(input)).missingVariables.filter(
          (m) => !asked.includes(m.id)
        )
      : [];

  const decide = (): { shouldInterview: boolean; stopReason?: PlanContextSnapshot["stopReason"] } => {
    // Nothing to plan around yet: asking about a goal that doesn't exist is
    // noise, and onboarding covers this ground.
    if (input.initiatives.length === 0) {
      return { shouldInterview: false, stopReason: "no_initiatives" };
    }

    // A hard daily ceiling. The coach earns the right to ask by being useful,
    // and a wall of questions is the fastest way to lose that.
    if (asked.length >= MAX_QUESTIONS_PER_DAY) {
      return { shouldInterview: false, stopReason: "max_questions" };
    }

    if (candidates.length === 0 && missingGoalVariables.length === 0) {
      return { shouldInterview: false, stopReason: "no_gaps" };
    }

    // Context is good enough overall, and nothing weak is left worth asking.
    if (overall >= STOP_OVERALL) {
      const weakRemaining = candidates.some((d) => d.score < STOP_WEAK_DIM);
      if (!weakRemaining && missingGoalVariables.length <= 1) {
        return { shouldInterview: false, stopReason: "coverage_sufficient" };
      }
    }

    if (candidates.length === 0) {
      // Only goal variables remain; the goal interview handles those.
      return { shouldInterview: true };
    }

    return { shouldInterview: true };
  };

  const { shouldInterview, stopReason } = decide();

  return {
    dimensions,
    overall,
    planningQuality: quality,
    shouldInterview,
    stopReason,
  };
}

/**
 * The single highest-value question to ask right now, or null.
 *
 * "Highest value" is the weakest dimension, breaking ties by marginal gain —
 * the score a good answer is expected to add.
 */
export function pickNextInterviewDimension(
  input: DimensionInput
): ContextDimension | null {
  if (!buildPlanContextSnapshot(input).shouldInterview) return null;

  const asked = input.questionsAskedToday ?? [];
  const candidates = computeContextDimensions(input).filter(
    (d) =>
      DIMENSION_META[d.id].interviewable &&
      !asked.includes(d.id) &&
      d.marginalGain >= MARGINAL_GAIN_FLOOR
  );

  if (candidates.length === 0) return null;

  return candidates.sort((a, b) => a.score - b.score || b.marginalGain - a.marginalGain)[0];
}

export function questionForDimension(
  dimension: ContextDimensionId,
  ctx: { initiativeTitle?: string }
): { prompt: string; subtitle?: string; inputType: "text" | "number" | "date" } {
  switch (dimension) {
    case "goal_clarity":
      return {
        prompt: "What business or project are you actively building?",
        subtitle: "Helps Mettle connect daily tasks to your direction.",
        inputType: "text",
      };
    case "initiative_clarity":
      return {
        prompt: "What are you actively trying to achieve in the next 90 days?",
        subtitle: "Be specific — e.g. 50 beta users, lose 5 kg, pass prelims.",
        inputType: "text",
      };
    case "deadline_clarity":
      return {
        prompt: ctx.initiativeTitle
          ? `When do you want to achieve "${ctx.initiativeTitle}" by?`
          : "When do you need to achieve this by?",
        inputType: "date",
      };
    case "obstacle_clarity":
      return {
        prompt: "What's the biggest thing preventing progress right now?",
        subtitle: "Mettle will plan around this — user acquisition, time, clarity, etc.",
        inputType: "text",
      };
    case "available_time":
      return {
        prompt: "How many hours a week can you realistically give this?",
        subtitle: "Be honest rather than aspirational — the plan is sized from this.",
        inputType: "number",
      };
    case "energy_pattern":
      return {
        prompt: "When in the day do you think most clearly?",
        subtitle: "Your hardest work should land there, not wherever it fits.",
        inputType: "text",
      };
    case "depletion_source":
      return {
        prompt: "What reliably drains you?",
        subtitle: "A meeting, a person, a kind of task — whatever costs you the most.",
        inputType: "text",
      };
    case "recovery_style":
      return {
        prompt: "What actually brings you back when you're empty?",
        subtitle: "What genuinely works, not what's supposed to.",
        inputType: "text",
      };
    default:
      return {
        prompt: "What would help us plan your day better?",
        inputType: "text",
      };
  }
}

export function improvementHints(input: DimensionInput | ContextDimension[]): string[] {
  if (Array.isArray(input)) {
    return input
      .filter((d) => !d.satisfied && d.gapHint)
      .sort((a, b) => a.score - b.score)
      .slice(0, 3)
      .map((d) => d.gapHint!);
  }
  const facts = knownFactsFromInput(input);
  return buildGoalAnalysis(facts)
    .missingVariables.slice(0, 3)
    .map((m) => m.why);
}
