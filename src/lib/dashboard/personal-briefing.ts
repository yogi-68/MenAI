import type { UserModel } from "@/lib/user-model/types";
import { buildUnderstandingSummary } from "@/lib/user-model/understanding-summary";

export type BriefingPhase = "morning" | "afternoon" | "evening";

export interface PersonalBriefing {
  phase: BriefingPhase;
  headline: string;
  todaysFocus: string | null;
  mostImportantTask: string | null;
  watchOut: string | null;
  progressLine: string | null;
  reflectionPrompts: string[] | null;
  mentorBrief: string;
  stillLearning: string | null;
}

const WATCH_OUT_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  {
    pattern: /overthink|overplan|refin|system/i,
    message:
      "You've spent a lot of time improving systems. Today is better spent getting user feedback.",
  },
  {
    pattern: /procrastin|avoid/i,
    message: "You tend to push high-value tasks to later in the day.",
  },
  {
    pattern: /scatter|too many|priorit/i,
    message: "Competing priorities can pull you off the current initiative.",
  },
  {
    pattern: /inconsist/i,
    message: "Momentum breaks when follow-through slips — protect one win today.",
  },
];

function detectWatchOut(model: UserModel): string | null {
  for (const obstacle of model.obstacles) {
    const hit = WATCH_OUT_PATTERNS.find((w) => w.pattern.test(obstacle));
    if (hit) return hit.message;
  }
  const blocker = model.stillNeeds.find((s) =>
    /block|slow|avoid|stuck|overthink|system/i.test(s)
  );
  if (blocker) return blocker;
  if (model.confidence === "low" && model.activePortfolio.length > 0) {
    return "Setup mode — finish a few real tasks before adding more structure.";
  }
  return null;
}

export function buildPersonalBriefing(input: {
  model: UserModel;
  hour: number;
  focusTitle: string | null;
  focusTasks: Array<{ title: string; status: string }>;
  completedToday: number;
  totalToday: number;
  firstName: string;
}): PersonalBriefing {
  const phase: BriefingPhase =
    input.hour < 12 ? "morning" : input.hour < 18 ? "afternoon" : "evening";

  const understanding = buildUnderstandingSummary(input.model);
  const focusTitle = input.focusTitle || input.model.currentFocus.title;
  const pending = input.focusTasks.filter((t) => t.status !== "completed");
  const mostImportant = pending[0]?.title || input.focusTasks[0]?.title || null;
  const watchOut = detectWatchOut(input.model);

  if (phase === "morning") {
    const greeting = input.firstName !== "there" ? input.firstName : "there";
    return {
      phase,
      headline: `Good morning, ${greeting}.`,
      todaysFocus: focusTitle,
      mostImportantTask: mostImportant,
      watchOut,
      progressLine: null,
      reflectionPrompts: null,
      mentorBrief: understanding.mentorBrief,
      stillLearning: understanding.stillLearning,
    };
  }

  if (phase === "afternoon") {
    const done = input.completedToday;
    const total = input.totalToday || input.focusTasks.length + done;
    const biggestLeft = pending[0]?.title || null;
    return {
      phase,
      headline:
        total > 0
          ? `You've completed ${done} of ${total} planned action${total === 1 ? "" : "s"}.`
          : "Afternoon check-in.",
      todaysFocus: focusTitle,
      mostImportantTask: biggestLeft,
      watchOut: null,
      progressLine: biggestLeft
        ? `The highest-value thing remaining: ${biggestLeft}.`
        : null,
      reflectionPrompts: null,
      mentorBrief: understanding.mentorBrief,
      stillLearning: understanding.stillLearning,
    };
  }

  return {
    phase,
    headline: "End of day.",
    todaysFocus: focusTitle,
    mostImportantTask: null,
    watchOut: null,
    progressLine: null,
    reflectionPrompts: [
      "What moved forward today?",
      "What slowed you down?",
      "What should tomorrow know?",
    ],
    mentorBrief: understanding.mentorBrief,
    stillLearning: understanding.stillLearning,
  };
}
