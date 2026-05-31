import type { UserModel } from "@/lib/user-model/types";
import { sanitizeCoachCopy } from "@/lib/user-model/content-guard";
import { dedupeSemanticThemes } from "@/lib/user-model/theme-dedup";
import { buildUnderstandingSummary } from "@/lib/user-model/understanding-summary";
import { COACH_VOICE_PROMPT } from "@/lib/user-model/voice-guide";
import { MENTOR_PRODUCT_RULE } from "@/lib/mentor/product-rule";

/** Inject into any LLM system prompt — the single source of truth about this user. */
export function formatUserModelForPrompt(model: UserModel): string {
  const sections: string[] = [
    "## USER MODEL (authoritative — all features must align with this)",
    model.narrative,
    "",
    `Confidence in this model: ${model.confidence}`,
  ];

  if (model.whoAmIAnswer) {
    sections.push(`Who am I (evidence-based):\n${model.whoAmIAnswer}`);
  }

  if (model.evidence.length > 0) {
    sections.push("Evidence on file:", ...model.evidence.map((e) => `- ${e}`));
  }

  if (model.whoAmIStatements.length > 0) {
    sections.push(
      "Statement tags (internal — only verified + strong_inference may appear in answers):",
      ...model.whoAmIStatements.map((s) => `- [${s.tag}] ${s.text}`)
    );
  }

  if (model.currentMilestone) {
    sections.push(`Current milestone (focus initiative only): ${model.currentMilestone}`);
  }

  if (model.executionAllocation.length > 0) {
    sections.push(
      "Execution allocation (today's time budget — mix tasks proportionally):",
      ...model.executionAllocation.map(
        (a) => `- ${a.title}: ${a.percent}% (${a.role}) — ${a.rationale}`
      )
    );
  }

  if (model.activePortfolio.length > 0) {
    sections.push(
      "Active portfolio:",
      ...model.activePortfolio.map(
        (p) =>
          `- ${p.title}${p.isFocus ? " [FOCUS]" : ""} (${p.healthLabel})`
      )
    );
  }

  if (model.secondaryOutcomes.length > 0) {
    sections.push(
      "Long-term direction (goals — maintenance only, not primary daily blocks):",
      ...model.secondaryOutcomes
        .filter((o) => o.role === "direction")
        .map((o) => `- ${o.title}`)
    );
  }

  if (model.opportunities.length > 0) {
    sections.push(`Active opportunities: ${model.opportunities.join("; ")}`);
  }

  sections.push(
    "",
    MENTOR_PRODUCT_RULE,
    "",
    COACH_VOICE_PROMPT,
    "",
    "FOCUS-FIRST: Today's plan must prioritize CURRENT FOCUS initiative (~80%+ of tasks). Long-term direction informs why — never generates generic maintenance tasks unless that IS the focus.",
    "Never invent workshops, certifications, generic finance tracking, or outreach unless explicitly in initiative context.",
    "When the user asks 'who am I', synthesize from full memory graph — onboarding, goals, chat, patterns — NOT the current initiative title alone.",
    "When the user asks about their goal, speak to momentum and the next 30 days — not robotic 'Your goal is...'",
    "NEVER invent personality traits without cited evidence.",
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
  const themes = dedupeSemanticThemes([
    ...model.identity.longTermDirections,
    ...model.secondaryOutcomes.filter((o) => o.role === "direction").map((o) => o.title),
  ]);
  const longTerm = themes.length > 0 ? themes.join(" · ") : null;

  const understanding = buildUnderstandingSummary(model);

  return {
    primary: primary || null,
    longTerm,
    insight: sanitizeCoachCopy(understanding.mentorBrief),
  };
}

export function userModelToCoachBriefing(model: UserModel) {
  const understanding = buildUnderstandingSummary(model);
  return {
    tryingToAchieve: model.currentFocus.title,
    understands: [],
    stillNeeds: [],
    insight: understanding.mentorBrief,
    mentorBrief: understanding.mentorBrief,
    stillLearning: understanding.stillLearning,
    mattersToday: model.currentMilestone
      ? model.currentMilestone
      : model.primaryOutcome.headline,
    recentActivity: model.recentActivity,
    understanding,
  };
}
