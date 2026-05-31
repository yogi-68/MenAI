import type { UserModel } from "@/lib/user-model/types";

export interface CoachingChallenge {
  headline: string;
  detail: string;
}

function num(val: unknown): number | null {
  if (val == null || val === "") return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

export function detectCoachingChallenges(model: UserModel): CoachingChallenge[] {
  const challenges: CoachingChallenge[] = [];
  const pc = model.planningSnapshot ?? {};
  const stats = model.executionStats ?? { completedTasks7d: 0, reflections7d: 0 };
  const domain = model.currentFocus.domain;
  const focusTitle = model.currentFocus.title ?? "";
  const hasExecutionData = stats.completedTasks7d >= 1 || stats.reflections7d >= 1;

  if (!hasExecutionData || !focusTitle) return challenges;

  const trainingDays = num(pc.trainingDaysPerWeek);
  const weeklyHours = num(pc.weeklyAvailableHours);
  const bodyFatTarget = /body fat|15%|fat loss/i.test(
    `${focusTitle} ${model.primaryOutcome.headline || ""}`
  );

  if (domain === "fitness" && bodyFatTarget) {
    if (trainingDays != null && trainingDays <= 1) {
      challenges.push({
        headline: "Target and effort may be mismatched",
        detail:
          "A body-fat goal usually needs more than one workout per week. Name the gap directly — don't ignore it.",
      });
    }
    if (weeklyHours != null && weeklyHours < 3) {
      challenges.push({
        headline: "Limited weekly time vs ambitious fitness target",
        detail: `Only ~${weeklyHours} hours/week available. Ask whether the deadline is realistic or needs adjusting.`,
      });
    }
    if (stats.completedTasks7d === 0 && model.confidence !== "high") {
      challenges.push({
        headline: "Goal set but no execution logged yet",
        detail: "The fitness target exists on paper but nothing has been completed this week. Challenge gently.",
      });
    }
  }

  if (domain === "business" && weeklyHours != null && weeklyHours < 5) {
    challenges.push({
      headline: "Business-building goal with very little available time",
      detail: "Ask what they're willing to cut or defer to make room.",
    });
  }

  if (domain === "learning") {
    const studyHours = num(pc.studyHoursPerDay);
    if (studyHours != null && studyHours < 1) {
      challenges.push({
        headline: "Learning goal without daily study time",
        detail: "The target and daily habits don't line up yet — say so plainly.",
      });
    }
  }

  if (
    model.primaryOutcome.targetDate &&
    stats.completedTasks7d < 2 &&
    model.confidence === "low"
  ) {
    const deadline = new Date(model.primaryOutcome.targetDate);
    const daysLeft = Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysLeft > 0 && daysLeft <= 21) {
      challenges.push({
        headline: "Deadline approaching with thin execution history",
        detail: `~${daysLeft} days left and almost no logged progress. Worth a direct conversation.`,
      });
    }
  }

  return challenges.slice(0, 3);
}

export function formatChallengesForPrompt(challenges: CoachingChallenge[]): string {
  if (challenges.length === 0) return "";
  return `## Coaching challenge mode (enough data — challenge directly)
${challenges.map((c) => `- ${c.headline}: ${c.detail}`).join("\n")}

Use coach voice. Example: "Your target and current effort level appear mismatched."
Do NOT be harsh — be honest and constructive.`;
}
