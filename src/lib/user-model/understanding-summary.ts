import type { UserModel } from "@/lib/user-model/types";
import { missingKnowledgeLabels } from "@/lib/user-model/identity-dimensions";
import { dedupeSemanticThemes } from "@/lib/user-model/theme-dedup";

export interface UnderstandingSummary {
  known: string[];
  unclear: string[];
}

function formatInitiativeLine(title: string, targetDate: string | null, isFocus: boolean): string {
  const prefix = isFocus ? "Active focus" : "Also pursuing";
  if (targetDate) {
    const d = new Date(targetDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    return `${prefix}: ${title} (by ${d})`;
  }
  return `${prefix}: ${title}`;
}

export function buildUnderstandingSummary(model: UserModel): UnderstandingSummary {
  const known: string[] = [];

  const themes = dedupeSemanticThemes([
    ...model.identity.longTermDirections,
    ...model.secondaryOutcomes.filter((o) => o.role === "direction").map((o) => o.title),
  ]);

  for (const theme of themes) {
    known.push(`Interested in ${theme.toLowerCase()}`);
  }

  for (const init of model.activePortfolio) {
    const match = model.secondaryOutcomes.find((o) => o.id === init.initiativeId);
    const target = match?.targetDate ?? init.targetDate ?? model.primaryOutcome.targetDate;
    known.push(formatInitiativeLine(init.title, target, init.isFocus));
  }

  if (model.activePortfolio.length === 0 && model.currentFocus.title) {
    known.push(formatInitiativeLine(model.currentFocus.title, model.primaryOutcome.targetDate, true));
  }

  if (model.recentActivity?.includes("completed")) {
    const m = model.recentActivity.match(/(\d+) task/);
    if (m) known.push(`${m[1]} task(s) completed this week`);
  }

  const unclear = new Set<string>(model.stillNeeds.map((s) => s.trim()).filter(Boolean));

  for (const label of missingKnowledgeLabels(model.identityCoverage, 30)) {
    unclear.add(label);
  }

  const focusDomain = model.currentFocus.domain;
  if (focusDomain === "fitness") {
    unclear.add("Current body-fat %");
    unclear.add("Training schedule");
    unclear.add("Available hours per week");
  }

  const focusTitle = model.currentFocus.title?.toLowerCase() || "";
  const hasRealEstate =
    /real estate|property invest|realtor/i.test(focusTitle) ||
    model.identity.longTermDirections.some((d) => /real estate|property/i.test(d));

  if (hasRealEstate) {
    unclear.add("Real-estate priority level");
  }

  if (
    !model.recentActivity?.includes("completed") &&
    model.confidence === "low"
  ) {
    unclear.add("Execution history — no tasks logged yet");
  }

  return {
    known: [...new Set(known)].slice(0, 8),
    unclear: [...unclear].slice(0, 6),
  };
}
