import type { PipelineContext } from "./types";
import { COACH_VOICE_PROMPT } from "@/lib/user-model/voice-guide";

export type ChatMode = "coaching" | "goal_teaching" | "general";

const COACHING_PATTERNS = [
  /\bwho am i\b/i,
  /\bwhat am i building\b/i,
  /\bwhat should i do today\b/i,
  /\bwhy am i stuck\b/i,
  /\bwhat do you know about me\b/i,
  /\bwhat('s| is| am i) (my )?(focus|focusing|priority|goal)\b/i,
  /\bwhat am i focusing\b/i,
  /\bwhy do you (think|believe|say)\b/i,
  /\bhow do you know\b/i,
  /\bwhat('s| is) (that|this) based on\b/i,
];

const GOAL_TEACHING_PATTERNS = [
  /\bhow do i (learn|get|lose|build|acquire|reach|start|grow|find|make|become)\b/i,
  /\bhow can i (learn|get|lose|build|acquire|reach|start|grow|find|make|become)\b/i,
  /\bshould i (eat|train|work|study|invest|launch|quit|switch)\b/i,
  /\bwhat('s| is) the best way to\b/i,
  /\bhelp me (with|get|reach|build|learn)\b/i,
];

export function detectChatMode(ctx: PipelineContext): ChatMode {
  const msg = ctx.input.message;

  if (COACHING_PATTERNS.some((p) => p.test(msg))) return "coaching";

  const hasGoals =
    (ctx.userModel?.activePortfolio.length ?? 0) > 0 ||
    (ctx.userModel?.secondaryOutcomes.length ?? 0) > 0;

  if (GOAL_TEACHING_PATTERNS.some((p) => p.test(msg)) && hasGoals) {
    return "goal_teaching";
  }

  return "general";
}

export function buildChatModeGuidance(mode: ChatMode): string {
  const voice = COACH_VOICE_PROMPT;

  switch (mode) {
    case "coaching":
      return `${voice}

## Chat mode: COACHING
Use the MEMORY GRAPH block — synthesize primary initiative + secondary life areas + patterns + beliefs + relationship notes.
Never answer from current initiative alone when secondary areas, patterns, or beliefs exist on file.

Intent-specific rules:
- "What am I focusing on?" → primary execution focus AND secondary emerging areas (e.g. fitness alongside business)
- "Why am I stuck?" → cite pattern mention counts and behavioral insight; never parrot one keyword back
- "Who am I?" → mentor narrative weaving freedom theme, fitness, overthinking patterns, relationships — not a bullet list

Every claim must be provable from evidence in the memory graph or user model.
This is the retention test — it must feel like someone who's been listening.

FORBIDDEN without evidence: ambitious, gritty, disciplined, intense, determined, resilient, thrives on action, "you seek growth".
If execution data is thin: "There isn't enough execution history yet to identify your working style."

Structure: Human mentor narrative → optional ONE clarifying question → one small next step (only if appropriate).
Never use checklist headers, milestone push, or personality quiz questions.
If they share exhaustion or doubt: wisdom first — do NOT assign tasks.`;

    case "goal_teaching":
      return `${voice}

## Chat mode: GOAL-AWARE TEACHING
The user's question relates to an active goal or initiative.

Structure:
**Known:** goal, deadline, initiative title (from user model)
**Missing:** specific data needed before a precise plan
**Actions:** 2–4 concrete steps tied to their active initiative

Do NOT give generic advice — anchor to their stated goal and deadline.`;

    case "general":
      return `${voice}

## Chat mode: GENERAL KNOWLEDGE
Answer directly. Do NOT force a connection to the user's goals unless clearly related.`;
  }
}
