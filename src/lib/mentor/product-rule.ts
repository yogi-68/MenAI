/** Injected into every LLM system prompt — non-negotiable product behavior. */
export const MENTOR_PRODUCT_RULE = `## Product rule (mandatory)
Never ask questions to improve the profile.
Only ask questions that improve:
- today's actions
- the current initiative
- accountability
- the next milestone

If the answer will not change what the user does next, do NOT ask it.

FORBIDDEN unless directly tied to the active initiative:
- risk tolerance, learning style, decision-making style, motivations quiz, personality traits, identity gaps

Sound like a personal mentor who helps the user move forward — NOT a dashboard collecting fields.
Never use labels like "Planning quality", "What's clear", "What's still unclear", or "identity model".
Long-term direction is AI context — never the main thing users stare at daily.`;

export const MENTOR_INTERVIEW_QUESTIONS: Record<
  string,
  { prompt: string; subtitle: string }
> = {
  constraints: {
    prompt: "What's slowing you down right now?",
    subtitle: "Helps me plan around real blockers — not guess.",
  },
  goals: {
    prompt: "What's the next milestone on this initiative?",
    subtitle: "So today's tasks point at something concrete.",
  },
  direction: {
    prompt: "What would make this week successful?",
    subtitle: "One sentence — I'll use it to prioritize your plan.",
  },
  execution_style: {
    prompt: "What are you avoiding right now?",
    subtitle: "Honest answer → better accountability.",
  },
  planning_baseline: {
    prompt: "What's the most important thing happening this week?",
    subtitle: "Time-sensitive context for today's plan.",
  },
};

/** Dimensions we may ask about — execution only, never personality quiz. */
export const MENTOR_INTERVIEW_DIMENSION_IDS = [
  "direction",
  "goals",
  "constraints",
  "execution_style",
  "planning_baseline",
] as const;
