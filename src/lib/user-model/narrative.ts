import type { UserModel } from "@/lib/user-model/types";
import { USER_MODEL_VERSION } from "@/lib/user-model/types";
import type { CoachDomain } from "@/lib/plans/coach-insights";

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

export function buildWhoAmIAnswer(model: UserModel): string {
  const parts: string[] = [];

  if (model.identity.labels.length > 0) {
    parts.push(`Identity: ${model.identity.labels.join(". ")}.`);
  }

  if (model.currentFocus.title) {
    parts.push(
      `Primary execution focus: ${model.primaryOutcome.headline || model.currentFocus.title}.`
    );
  }

  if (model.secondaryOutcomes.length > 0) {
    const secondary = model.secondaryOutcomes
      .slice(0, 3)
      .map((o) => o.title)
      .join("; ");
    parts.push(`Longer-term themes also in play: ${secondary}.`);
  }

  if (model.stillNeeds.length > 0) {
    parts.push(
      `What's still unclear: ${model.stillNeeds.slice(0, 4).map((s) => `• ${s}`).join(" ")}`
    );
  }

  if (parts.length === 0) {
    return "MenAI doesn't have enough structured context yet. Add one initiative with a deadline and answer the planning questions — then I can describe who you're becoming with specificity.";
  }

  return parts.join("\n\n");
}

export function buildUserModelNarrative(input: {
  identityLabels: string[];
  vision: string | null;
  primaryTitle: string | null;
  primaryDomain: CoachDomain;
  primaryHeadline: string | null;
  secondaryTitles: string[];
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
      `CURRENT EXECUTION FOCUS (${domainThemeLabel(input.primaryDomain)}): ${input.primaryHeadline || input.primaryTitle}`
    );
  }

  if (input.secondaryTitles.length > 0) {
    lines.push(
      `Secondary themes (direction, not today's primary): ${input.secondaryTitles.join("; ")}`
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
    "RULE: When answering about the user, treat CURRENT EXECUTION FOCUS as primary. Secondary themes are long-term direction — do not merge them into today's plan or primary outcome."
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
