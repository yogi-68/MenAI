import type { UserModel } from "@/lib/user-model/types";

/** Inject into any LLM system prompt — the single source of truth about this user. */
export function formatUserModelForPrompt(model: UserModel): string {
  const sections: string[] = [
    "## USER MODEL (authoritative — all features must align with this)",
    model.narrative,
    "",
    `Confidence in this model: ${model.confidence}`,
  ];

  if (model.primaryOutcome.headline) {
    sections.push(`Primary outcome: ${model.primaryOutcome.headline}`);
  }

  if (model.currentMilestone) {
    sections.push(`Current milestone (focus initiative only): ${model.currentMilestone}`);
  }

  if (model.secondaryOutcomes.length > 0) {
    sections.push(
      "Secondary outcomes (long-term — NOT today's primary):",
      ...model.secondaryOutcomes.map((o) => `- [${o.role}] ${o.title}`)
    );
  }

  if (model.opportunities.length > 0) {
    sections.push(`Active opportunities: ${model.opportunities.join("; ")}`);
  }

  sections.push(
    "",
    "When the user asks 'who am I' or about their direction, use the primary vs secondary distinction above.",
    "Never attribute a secondary theme's outcome to the primary focus initiative."
  );

  return sections.join("\n");
}

/** Short block for dashboard / UI copy */
export function formatUserModelSummary(model: UserModel): {
  primary: string | null;
  longTerm: string | null;
  insight: string;
} {
  const primary = model.primaryOutcome.headline || model.currentFocus.title;
  const longTerm =
    model.secondaryOutcomes.length > 0
      ? model.secondaryOutcomes
          .filter((o) => o.role === "direction")
          .map((o) => o.title)
          .slice(0, 2)
          .join("; ") || model.identity.longTermDirections.slice(0, 2).join("; ")
      : model.identity.longTermDirections.slice(0, 2).join("; ") || null;

  let insight = model.whoAmIAnswer.split("\n\n")[0] || "";
  if (model.stillNeeds.length > 0) {
    insight += ` Still needs: ${model.stillNeeds.slice(0, 2).join(", ").toLowerCase()}.`;
  }

  return { primary: primary || null, longTerm: longTerm || null, insight: insight.trim() };
}

export function userModelToCoachBriefing(model: UserModel) {
  return {
    tryingToAchieve: model.currentFocus.title,
    understands: model.understands,
    stillNeeds: model.stillNeeds,
    insight: model.whoAmIAnswer.split("\n\n")[0] || model.narrative.split("\n")[0] || "",
    mattersToday: model.currentMilestone
      ? `Advance: ${model.currentMilestone}`
      : model.primaryOutcome.headline,
    recentActivity: model.recentActivity,
  };
}
