import type { UserModel } from "@/lib/user-model/types";
import type { EvidenceBundle } from "@/lib/user-model/evidence-bundle";
import { buildMemoryGraphIdentityAnswer } from "@/lib/user-model/memory-graph-identity";
import { sanitizeCoachCopy } from "@/lib/user-model/content-guard";
import { isConcreteInitiativeTitle } from "@/lib/initiatives/concreteness-gate";

export interface UnderstandingSummary {
  mentorBrief: string;
  stillLearning: string | null;
  known: string[];
  unclear: string[];
}

export function buildUnderstandingSummaryFromBundle(
  bundle: EvidenceBundle
): Pick<UnderstandingSummary, "mentorBrief" | "stillLearning"> {
  const graph = buildMemoryGraphIdentityAnswer(bundle);
  const mentorBrief = sanitizeCoachCopy(
    [graph.opening, ...graph.paragraphs].join("\n\n")
  );
  return {
    mentorBrief,
    stillLearning: `What I'm still learning is ${graph.stillLearning}`,
  };
}

export function buildUnderstandingSummary(model: UserModel): UnderstandingSummary {
  const graphParts: string[] = [];

  if (model.identity.longTermDirections.length > 0) {
    graphParts.push(
      `Long-term direction includes ${model.identity.longTermDirections.slice(0, 4).join(", ")}.`
    );
  }

  const focus = model.currentFocus.title;
  if (focus && isConcreteInitiativeTitle(focus)) {
    graphParts.push(`Current execution focus: ${focus}.`);
  }

  if (model.recentActivity?.includes("completed")) {
    graphParts.push(model.recentActivity);
  } else if (model.activePortfolio.length > 0 && model.confidence === "low") {
    graphParts.push(
      "Structure is in place — the next step is completing real tasks so patterns can emerge."
    );
  }

  const mentorBrief =
    graphParts.length > 0
      ? sanitizeCoachCopy(graphParts.join("\n\n"))
      : "Share what you're building — identity sharpens from what you do and say over time.";

  const stillLearning =
    model.confidence === "low"
      ? "What I'm still learning is what tends to derail your momentum when things get difficult."
      : null;

  return {
    mentorBrief,
    stillLearning,
    known: [],
    unclear: [],
  };
}
