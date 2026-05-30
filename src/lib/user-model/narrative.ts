import type { UserModel } from "@/lib/user-model/types";
import { USER_MODEL_VERSION } from "@/lib/user-model/types";
import type { CoachDomain } from "@/lib/plans/coach-insights";
import { buildWhoAmIAnswerFromContext } from "@/lib/user-model/identity-synthesis";

export function buildWhoAmIAnswer(model: UserModel): string {
  return buildWhoAmIAnswerFromContext({
    vision: model.identity.vision,
    founderMode: model.identity.labels.some((l) => /entrepreneur/i.test(l)),
    workStyle: null,
    identityLabels: model.identity.labels,
    identitySignals: [],
    goals: model.identity.longTermDirections.map((title) => ({ title, category: null })),
    initiativeThemes: model.activePortfolio.map((p) => ({
      title: p.title,
      lifeArea: p.lifeArea,
      domain: p.domain,
    })),
    focusTitle: model.currentFocus.title,
    focusDomain: model.currentFocus.domain,
    patterns: [],
    completedTasks7d: model.recentActivity?.includes("tasks completed") ? 3 : 0,
    reflections7d: 0,
    obstacles: model.obstacles,
    stillNeeds: model.stillNeeds,
    confidence: model.confidence,
    portfolioCount: model.activePortfolio.length,
    opportunities: model.opportunities,
    recentReflectionBlocks: [],
  });
}

function formatDeadline(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function domainThemeLabel(domain: CoachDomain): string {
  switch (domain) {
    case "fitness":
      return "fitness transformation";
    case "business":
      return "building a business";
    case "learning":
      return "structured learning";
    case "career":
      return "career advancement";
    default:
      return "active execution";
  }
}

export function buildUserModelNarrative(input: {
  identityLabels: string[];
  vision: string | null;
  primaryTitle: string | null;
  primaryDomain: CoachDomain;
  primaryHeadline: string | null;
  secondaryTitles: string[];
  portfolioTitles: string[];
  allocation: Array<{ title: string; percent: number; role: string }>;
  obstacles: string[];
  stillNeeds: string[];
  recentActivity: string | null;
}): string {
  const lines: string[] = [];

  if (input.identityLabels.length > 0) {
    lines.push(`Identity: ${input.identityLabels.join("; ")}.`);
  }
  if (input.vision) {
    lines.push(`Long-term vision: ${input.vision}`);
  }

  if (input.primaryTitle) {
    lines.push(
      `CURRENT FOCUS (${domainThemeLabel(input.primaryDomain)}): ${input.primaryHeadline || input.primaryTitle}`
    );
  }

  if (input.portfolioTitles.length > 0) {
    lines.push(`Active portfolio: ${input.portfolioTitles.join("; ")}`);
  }

  if (input.allocation.length > 0) {
    lines.push(
      "Execution allocation (today's time budget):",
      ...input.allocation.map(
        (a) => `- ${a.title}: ${a.percent}% (${a.role})`
      )
    );
  }

  if (input.secondaryTitles.length > 0) {
    lines.push(
      `Long-term direction (goals, not daily tasks): ${input.secondaryTitles.join("; ")}`
    );
  }

  if (input.obstacles.length > 0) {
    lines.push(`Known obstacles: ${input.obstacles.join("; ")}`);
  }

  if (input.stillNeeds.length > 0) {
    lines.push(`Still needs to know: ${input.stillNeeds.join("; ")}`);
  }

  if (input.recentActivity) {
    lines.push(`Recent activity: ${input.recentActivity}`);
  }

  lines.push(
    "RULE: One person, multiple pursuits. Keep initiative contexts separate (fitness answers stay on fitness). Today's plan intelligently mixes initiatives using execution allocation — focus gets the largest share, portfolio initiatives get proportional blocks."
  );

  return lines.join("\n");
}

export function buildPrimaryHeadline(input: {
  title: string;
  description: string | null;
  targetDate: string | null;
  ninetyDayOutcome: string | null;
  domain: CoachDomain;
}): string | null {
  if (input.ninetyDayOutcome?.trim()) {
    const deadline = input.targetDate ? ` by ${formatDeadline(input.targetDate)}` : "";
    return `${input.ninetyDayOutcome.trim()}${deadline}`;
  }

  const text = `${input.title} ${input.description || ""}`;
  const bf = text.match(/(\d{1,2})\s*%\s*body\s*fat/i);
  if (bf && input.targetDate) {
    return `Reduce body fat to ${bf[1]}% by ${formatDeadline(input.targetDate)}`;
  }

  if (input.targetDate) {
    return `${input.title} — deadline ${formatDeadline(input.targetDate)}`;
  }

  return input.title;
}

export function emptyUserModel(): UserModel {
  const model: UserModel = {
    version: USER_MODEL_VERSION,
    synthesizedAt: new Date().toISOString(),
    identity: { labels: [], vision: null, longTermDirections: [] },
    currentFocus: {
      initiativeId: null,
      title: null,
      lifeArea: null,
      domain: "general",
      until: null,
    },
    primaryOutcome: { headline: null, ninetyDayOutcome: null, targetDate: null },
    secondaryOutcomes: [],
    activePortfolio: [],
    executionAllocation: [],
    obstacles: [],
    stillNeeds: ["A specific initiative with a deadline"],
    understands: [],
    recentActivity: null,
    currentMilestone: null,
    opportunities: [],
    confidence: "low",
    narrative: "No active initiatives. MenAI needs one specific 90-day outcome with a deadline.",
    whoAmIAnswer: "",
  };
  model.whoAmIAnswer = buildWhoAmIAnswer(model);
  return model;
}
