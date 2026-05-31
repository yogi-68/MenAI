import type { UserModel } from "@/lib/user-model/types";
import { sanitizeCoachCopy } from "@/lib/user-model/content-guard";
import { dedupeSemanticThemes } from "@/lib/user-model/theme-dedup";
import { buildUnderstandingSummary } from "@/lib/user-model/understanding-summary";
import { COACH_VOICE_PROMPT } from "@/lib/user-model/voice-guide";
import { missingKnowledgeLabels } from "@/lib/user-model/identity-dimensions";

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

  const gaps = missingKnowledgeLabels(model.identityCoverage, 30);
  if (gaps.length > 0) {
    sections.push("Biggest unknowns (plain language — use in answers, not percentages):", ...gaps.map((g) => `- ${g}`));
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
    COACH_VOICE_PROMPT,
    "",
    "One person, multiple pursuits. Keep initiative interview contexts separate — never use fitness context for business tasks.",
    "Today's plan SHOULD mix initiatives using execution allocation. Focus gets the largest block; portfolio initiatives get proportional time.",
    "When the user asks 'who am I', use whoAmIAnswer — ONLY verified facts and labeled strong inferences.",
    "NEVER invent personality traits (ambitious, gritty, disciplined, intense, determined, resilient) without cited evidence.",
    "When asked 'why do you believe that', cite specific stored facts (goal titles, initiative names, task counts). Acknowledge gaps honestly.",
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
  const insight =
    understanding.known.length > 0
      ? understanding.known[0]
      : "Still building your profile from what you've logged so far.";

  return { primary: primary || null, longTerm, insight: sanitizeCoachCopy(insight) };
}

export function userModelToCoachBriefing(model: UserModel) {
  const understanding = buildUnderstandingSummary(model);
  return {
    tryingToAchieve: model.currentFocus.title,
    understands: understanding.known,
    stillNeeds: understanding.unclear,
    insight: "",
    mattersToday: model.currentMilestone
      ? `Advance: ${model.currentMilestone}`
      : model.primaryOutcome.headline,
    recentActivity: model.recentActivity,
    understanding,
  };
}
