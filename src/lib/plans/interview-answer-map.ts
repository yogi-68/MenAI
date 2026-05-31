import type { SupabaseClient } from "@supabase/supabase-js";
import type { IdentityDimensionId } from "@/lib/user-model/identity-dimensions";
import { computeBaselineCoverage } from "@/lib/user-model/identity-synthesis";
import type { PlanContextData } from "@/lib/plans/plan-interview";

/** Apply a planning interview answer to plan_context fields (no DB). */
export function mapAnswerToPlanContextPatch(
  variableId: string,
  answer: string,
  dimension?: IdentityDimensionId
): Partial<PlanContextData> {
  const trimmed = answer.trim();
  if (!trimmed) return {};

  const patch: Partial<PlanContextData> = {};
  const lower = variableId.toLowerCase();

  switch (variableId) {
    case "currentWeight":
      patch.currentWeight = Number(trimmed) || null;
      break;
    case "currentBodyFatPct":
      patch.currentBodyFatPct = Math.min(60, Math.max(3, Number(trimmed) || 0));
      break;
    case "trainingDaysPerWeek":
      patch.trainingDaysPerWeek = Math.min(7, Math.max(1, Number(trimmed) || 0));
      break;
    case "studyHoursPerDay":
      patch.studyHoursPerDay = Math.min(16, Math.max(0.5, Number(trimmed) || 0));
      break;
    case "weeklyAvailableHours":
      patch.weeklyAvailableHours = Math.min(80, Math.max(1, Number(trimmed) || 0));
      break;
    case "biggestObstacle":
      patch.biggestObstacle = trimmed;
      break;
    case "initiativeOutcome90d":
      patch.initiativeOutcome90d = trimmed;
      break;
    case "currentMetric":
      patch.currentMetric = trimmed;
      break;
    default:
      if (dimension === "constraints" || /obstacle|constraint|blocker/i.test(lower)) {
        patch.biggestObstacle = trimmed;
      } else if (dimension === "planning_baseline" || dimension === "execution_style") {
        if (/bodyfat|body_fat|body-fat/i.test(lower)) {
          patch.currentBodyFatPct = Math.min(60, Math.max(3, Number(trimmed) || 0));
        } else if (/weight/i.test(lower)) {
          patch.currentWeight = Number(trimmed) || null;
        } else if (/train|workout|day/i.test(lower)) {
          const n = Number(trimmed);
          if (Number.isFinite(n)) {
            patch.trainingDaysPerWeek = Math.min(7, Math.max(1, n));
          }
        } else if (/hour|time|available|capacity/i.test(lower)) {
          const n = Number(trimmed);
          if (Number.isFinite(n)) {
            patch.weeklyAvailableHours = Math.min(80, Math.max(1, n));
          }
        } else if (/study/i.test(lower)) {
          patch.studyHoursPerDay = Math.min(16, Math.max(0.5, Number(trimmed) || 0));
        } else if (/metric|customer|mrr|user|revenue/i.test(lower)) {
          patch.currentMetric = trimmed;
        } else if (/outcome|90/i.test(lower)) {
          patch.initiativeOutcome90d = trimmed;
        } else {
          const n = Number(trimmed);
          if (Number.isFinite(n) && n > 0 && n < 200) {
            if (/fat|bf/i.test(lower)) patch.currentBodyFatPct = Math.min(60, Math.max(3, n));
            else if (/weight/i.test(lower)) patch.currentWeight = n;
            else if (/train|day/i.test(lower)) patch.trainingDaysPerWeek = Math.min(7, Math.max(1, n));
            else patch.weeklyAvailableHours = Math.min(80, Math.max(1, n));
          }
        }
      } else if (/obstacle|constraint|blocker/i.test(lower)) {
        patch.biggestObstacle = trimmed;
      }
      break;
  }

  return patch;
}

export function bumpCoverageAfterAnswer(
  coverage: ReturnType<typeof computeBaselineCoverage>,
  variableId: string,
  dimension?: IdentityDimensionId
): ReturnType<typeof computeBaselineCoverage> {
  const next = { ...coverage };
  const dim = dimension || "planning_baseline";
  next[dim] = Math.min(100, (next[dim] ?? 0) + 28);

  if (
    ["currentBodyFatPct", "currentWeight", "trainingDaysPerWeek", "weeklyAvailableHours", "studyHoursPerDay"].includes(
      variableId
    )
  ) {
    next.planning_baseline = Math.min(100, (next.planning_baseline ?? 0) + 35);
  }
  if (variableId === "biggestObstacle") {
    next.constraints = Math.min(100, (next.constraints ?? 0) + 35);
  }

  return next;
}

/** Side effects that need initiative row updates (run after plan context saved). */
export async function applyInitiativeSideEffects(
  supabase: SupabaseClient,
  userId: string,
  initiativeId: string,
  variableId: string,
  answer: string,
  patch: Partial<PlanContextData>,
  primaryDescription: string | null
): Promise<void> {
  const trimmed = answer.trim();

  if (variableId === "targetDate" && trimmed) {
    await supabase.from("initiatives").update({ target_date: trimmed }).eq("id", initiativeId);
  }

  if (variableId === "initiativeOutcome90d" && patch.initiativeOutcome90d) {
    await supabase
      .from("initiatives")
      .update({
        description: primaryDescription
          ? `${primaryDescription}\n90-day outcome: ${patch.initiativeOutcome90d}`
          : `90-day outcome: ${patch.initiativeOutcome90d}`,
      })
      .eq("id", initiativeId);
  }

  if (variableId === "biggestObstacle" && patch.biggestObstacle) {
    await supabase.from("commitments").insert({
      user_id: userId,
      description: `Current blocker: ${patch.biggestObstacle}`,
      category: "work",
      timeframe: "ongoing",
      status: "active",
      source: "plan_interview",
    });
  }
}
