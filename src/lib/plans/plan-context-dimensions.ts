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
  | "recent_activity";

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
    interviewAskedToday?: string[];
  };
  questionsAskedToday: string[];
}

const STOP_OVERALL = 78;
const STOP_WEAK_DIM = 70;
const MARGINAL_GAIN_FLOOR = 8;
const MAX_QUESTIONS_PER_DAY = 5;

const DIMENSION_META: Record<
  ContextDimensionId,
  { label: string; gapHint: string; interviewable: boolean; weight: number }
> = {
  goal_clarity: {
    label: "Goal",
    gapHint: "Share a baseline MenAI doesn't have yet (weight, users, study hours)",
    interviewable: false,
    weight: 0.15,
  },
  initiative_clarity: {
    label: "Initiative",
    gapHint: "Add a measurable 90-day outcome",
    interviewable: false,
    weight: 0.25,
  },
  deadline_clarity: {
    label: "Deadline",
    gapHint: "Set a target date",
    interviewable: false,
    weight: 0.2,
  },
  obstacle_clarity: {
    label: "Biggest obstacle",
    gapHint: "Name what's actually blocking progress",
    interviewable: false,
    weight: 0.2,
  },
  available_time: {
    label: "Available time",
    gapHint: "Share how much time you can spend this week",
    interviewable: false,
    weight: 0.15,
  },
  recent_activity: {
    label: "Recent activity",
    gapHint: "Complete a task or log a reflection",
    interviewable: false,
    weight: 0.05,
  },
};

function scoreGoalClarity(input: DimensionInput): number {
  if (input.initiatives.length === 0) return 10;
  const init = input.initiatives[0];
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

export function buildPlanContextSnapshot(input: DimensionInput): PlanContextSnapshot {
  const dimensions = computeContextDimensions(input);
  const overall = overallFromDimensions(dimensions);
  const quality = planningQualityLabel(overall);

  const unansweredInterviewable = dimensions.filter(
    (d) => DIMENSION_META[d.id].interviewable && !input.questionsAskedToday.includes(d.id)
  );

  const weakest = [...unansweredInterviewable].sort(
    (a, b) => a.score - b.score || b.marginalGain - a.marginalGain
  )[0];

  let shouldInterview = false;
  let stopReason: PlanContextSnapshot["stopReason"];

  if (overall >= STOP_OVERALL) {
    stopReason = "threshold_met";
  } else if (!weakest || weakest.marginalGain < MARGINAL_GAIN_FLOOR) {
    stopReason = "low_marginal_gain";
  } else if (input.questionsAskedToday.length >= MAX_QUESTIONS_PER_DAY) {
    stopReason = "threshold_met";
  } else if (unansweredInterviewable.every((d) => d.score >= STOP_WEAK_DIM) && overall >= 72) {
    stopReason = "threshold_met";
  } else if (weakest && weakest.marginalGain >= MARGINAL_GAIN_FLOOR) {
    shouldInterview = true;
  } else {
    stopReason = "no_gaps";
  }

  if (input.initiatives.length === 0) {
    shouldInterview = false;
  } else {
    const missing = buildGoalAnalysis(knownFactsFromInput(input)).missingVariables;
    const asked = input.questionsAskedToday || [];
    const unanswered = missing.filter((m) => !asked.includes(m.id));
    if (unanswered.length === 0) {
      shouldInterview = false;
      if (!stopReason) stopReason = "no_gaps";
    } else if (input.questionsAskedToday.length >= MAX_QUESTIONS_PER_DAY) {
      shouldInterview = false;
      stopReason = "threshold_met";
    } else if (overall >= STOP_OVERALL && unanswered.length <= 1) {
      shouldInterview = false;
      stopReason = "threshold_met";
    } else {
      shouldInterview = true;
    }
  }

  return {
    dimensions,
    overall,
    planningQuality: quality,
    shouldInterview,
    stopReason,
  };
}

export function pickNextInterviewDimension(
  input: DimensionInput
): ContextDimension | null {
  const snapshot = buildPlanContextSnapshot(input);
  if (!snapshot.shouldInterview) return null;

  const dimensions = computeContextDimensions(input);
  const candidates = dimensions.filter(
    (d) =>
      DIMENSION_META[d.id].interviewable &&
      !input.questionsAskedToday.includes(d.id) &&
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
        subtitle: "Helps MenAI connect daily tasks to your direction.",
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
        subtitle: "MenAI will plan around this — user acquisition, time, clarity, etc.",
        inputType: "text",
      };
    case "available_time":
      return {
        prompt: "How many hours per week can you realistically spend on this?",
        inputType: "number",
      };
    default:
      return {
        prompt: "What would help MenAI plan your day better?",
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
