import type { UserModel } from "@/lib/user-model/types";
import { dedupeSemanticThemes } from "@/lib/user-model/theme-dedup";
import { sanitizeCoachCopy } from "@/lib/user-model/content-guard";

export interface UnderstandingSummary {
  /** Human mentor briefing — no checklist labels. */
  mentorBrief: string;
  /** One line on what's still being learned — optional. */
  stillLearning: string | null;
  /** @deprecated Use mentorBrief — kept for API compat */
  known: string[];
  /** @deprecated Always empty — no personality gap lists in UI */
  unclear: string[];
}

function buildStillLearning(model: UserModel): string | null {
  if (!model.recentActivity?.includes("completed") && model.confidence === "low") {
    return "where your time actually goes each day and what tends to break your momentum.";
  }
  const blocker = model.stillNeeds.find((s) => /block|slow|avoid|stuck/i.test(s));
  if (blocker) {
    return blocker.replace(/^your /i, "").toLowerCase();
  }
  if (model.confidence === "low") {
    return "what a typical execution day looks like for you once tasks start landing.";
  }
  return null;
}

export function buildUnderstandingSummary(model: UserModel): UnderstandingSummary {
  const paragraphs: string[] = [];
  const focus = model.currentFocus.title;
  const themes = dedupeSemanticThemes([
    ...model.identity.longTermDirections,
    ...model.secondaryOutcomes.filter((o) => o.role === "direction").map((o) => o.title),
  ]);

  if (focus) {
    paragraphs.push(
      `You're focused on ${focus} — that's where most of your energy should go right now.`
    );
  }

  if (themes.length > 0) {
    const themeStr = themes.slice(0, 3).join(", ").toLowerCase();
    paragraphs.push(
      `The longer arc includes ${themeStr} — but today's plan should serve the current initiative, not scatter across everything.`
    );
  } else if (model.primaryOutcome.headline) {
    paragraphs.push(model.primaryOutcome.headline);
  }

  if (model.recentActivity?.includes("completed")) {
    const m = model.recentActivity.match(/(\d+) task/);
    if (m) {
      paragraphs.push(`You've been executing — ${m[1]} task(s) completed recently.`);
    }
  } else if (model.activePortfolio.length > 0 && model.confidence === "low") {
    paragraphs.push(
      "You're still in setup mode — structure is in place; the next step is completing a few real tasks so patterns can emerge."
    );
  }

  const mentorBrief = sanitizeCoachCopy(
    paragraphs.length > 0
      ? paragraphs.join("\n\n")
      : "Tell me what you're building right now — one initiative with a deadline — and I'll shape plans around it."
  );

  const stillLearning = buildStillLearning(model);
  const stillLearningLine = stillLearning
    ? `What I'm still learning is ${stillLearning.endsWith(".") ? stillLearning : stillLearning + "."}`
    : null;

  return {
    mentorBrief,
    stillLearning: stillLearningLine,
    known: [],
    unclear: [],
  };
}
