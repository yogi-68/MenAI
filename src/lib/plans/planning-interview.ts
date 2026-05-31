import type { GoalAnalysis, MissingVariable } from "@/lib/plans/coach-insights";
import type { DimensionInput } from "@/lib/plans/plan-context-dimensions";
import type { IdentityDimensionId } from "@/lib/user-model/identity-dimensions";
import type { InterviewQuestionPayload } from "@/lib/plans/plan-interview";

const MAX_PLANNING_QUESTIONS_PER_DAY = 5;

/** Map planning variable ids to identity dimension for storage. */
export function dimensionForPlanningVariable(id: string): IdentityDimensionId {
  if (
    id === "currentBodyFatPct" ||
    id === "currentWeight" ||
    id === "trainingDaysPerWeek" ||
    id === "studyHoursPerDay" ||
    id === "weeklyAvailableHours" ||
    id === "currentMetric" ||
    id === "initiativeOutcome90d" ||
    id === "targetDate"
  ) {
    return "planning_baseline";
  }
  if (id === "biggestObstacle") return "constraints";
  return "planning_baseline";
}

function mergedAskedToday(input: DimensionInput, identityAsked: string[]): string[] {
  const planAsked = input.planContext.interviewAskedToday || input.questionsAskedToday || [];
  return [...new Set([...identityAsked, ...planAsked])];
}

export function pickNextPlanningQuestion(
  input: DimensionInput,
  goalAnalysis: GoalAnalysis | null,
  identityAskedToday: string[]
): InterviewQuestionPayload | null {
  if (!goalAnalysis?.missingVariables.length) return null;

  const asked = mergedAskedToday(input, identityAskedToday);
  if (asked.length >= MAX_PLANNING_QUESTIONS_PER_DAY) return null;

  const next: MissingVariable | undefined = goalAnalysis.missingVariables.find(
    (m) => !asked.includes(m.id)
  );
  if (!next) return null;

  return {
    variableId: next.id,
    dimension: dimensionForPlanningVariable(next.id),
    prompt: next.question,
    subtitle: next.why,
    inputType: next.inputType,
    expectedGain: next.expectedGain ?? 15,
    biggestUnknown: next.label,
    questionNumber: asked.length + 1,
  };
}

export function planningGapsForUi(
  goalAnalysis: GoalAnalysis | null,
  identityAskedToday: string[],
  input: DimensionInput,
  limit = 3
): string[] {
  if (!goalAnalysis) return [];
  const asked = mergedAskedToday(input, identityAskedToday);
  return goalAnalysis.missingVariables
    .filter((m) => !asked.includes(m.id))
    .slice(0, limit)
    .map((m) => m.label);
}

export function shouldRunPlanningInterview(
  input: DimensionInput,
  goalAnalysis: GoalAnalysis | null,
  identityAskedToday: string[]
): boolean {
  if (input.initiatives.length === 0) return false;
  return pickNextPlanningQuestion(input, goalAnalysis, identityAskedToday) != null;
}
