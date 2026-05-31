import type { UserModel } from "@/lib/user-model/types";
import { buildUnderstandingSummary } from "@/lib/user-model/understanding-summary";

export type BriefingPhase = "morning" | "afternoon" | "evening";

export interface PersonalBriefing {
  phase: BriefingPhase;
  headline: string;
  companionLine: string | null;
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

function topWeaknessNote(model: UserModel): string | null {
  const blob = [...model.obstacles, ...model.stillNeeds].join(" ").toLowerCase();
  if (/overthink/.test(blob)) {
    return "You tend to gather information instead of testing assumptions — bias toward one conversation today.";
  }
  if (/procrastin/.test(blob)) {
    return "Small, time-boxed wins beat big plans when you're avoiding the hard thing.";
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
  yesterdayCompleted?: number;
  yesterdayTotal?: number;
  yesterdayWin?: string | null;
}): PersonalBriefing {
  const phase: BriefingPhase =
    input.hour < 12 ? "morning" : input.hour < 18 ? "afternoon" : "evening";

  const understanding = buildUnderstandingSummary(input.model);
  const focusTitle = input.focusTitle || input.model.currentFocus.title;
  const pending = input.focusTasks.filter((t) => t.status !== "completed");
  const mostImportant = pending[0]?.title || input.focusTasks[0]?.title || null;
  const watchOut = detectWatchOut(input.model) || topWeaknessNote(input.model);
  const yDone = input.yesterdayCompleted ?? 0;
  const yTotal = input.yesterdayTotal ?? 0;
  const yWin = input.yesterdayWin;

  if (phase === "morning") {
    const greeting = input.firstName !== "there" ? input.firstName : "there";
    let companionLine: string | null = null;
    if (yTotal > 0) {
      companionLine = `Yesterday you finished ${yDone} of ${yTotal} planned action${yTotal === 1 ? "" : "s"}.`;
      if (yWin) {
        companionLine += ` The biggest thing that moved you forward was ${yWin.toLowerCase()}. Let's continue that momentum today.`;
      } else if (focusTitle) {
        companionLine += ` Let's keep building on ${focusTitle} today.`;
      }
    } else if (focusTitle) {
      companionLine = `Today's anchor: ${focusTitle}. One solid win beats a long list.`;
    }

    return {
      phase,
      headline: `Good morning, ${greeting}.`,
      companionLine,
      todaysFocus: focusTitle,
      mostImportantTask: mostImportant,
      watchOut,
      progressLine: mostImportant ? `Start with: ${mostImportant}` : null,
      reflectionPrompts: null,
      mentorBrief: understanding.mentorBrief,
      stillLearning: understanding.stillLearning,
    };
  }

  if (phase === "afternoon") {
    const done = input.completedToday;
    const total = input.totalToday || input.focusTasks.length + done;
    const biggestLeft = pending[0]?.title || null;
    const companionLine = biggestLeft
      ? `Quick check-in — did the important task happen yet? Still open: ${biggestLeft}.`
      : done >= total && total > 0
        ? "You cleared today's plan. Anything left worth a quick push?"
        : "Quick check-in — what's the one thing that still needs to happen today?";

    return {
      phase,
      headline:
        total > 0
          ? `You've completed ${done} of ${total} planned action${total === 1 ? "" : "s"}.`
          : "Afternoon check-in.",
      companionLine,
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
    companionLine: "What slowed you down today? One sentence is enough.",
    todaysFocus: focusTitle,
    mostImportantTask: null,
    watchOut: null,
    progressLine:
      input.completedToday > 0
        ? `You completed ${input.completedToday} action${input.completedToday === 1 ? "" : "s"} today.`
        : null,
    reflectionPrompts: [
      "What moved forward today?",
      "What slowed you down?",
      "What should tomorrow know?",
    ],
    mentorBrief: understanding.mentorBrief,
    stillLearning: understanding.stillLearning,
  };
}
