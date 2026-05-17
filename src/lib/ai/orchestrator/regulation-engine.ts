/**
 * Emotional Regulation Engine
 * 
 * This is NOT empathy. This is REGULATION.
 * 
 * The difference:
 * - Empathy: "That sounds hard."           → user still feels the same
 * - Regulation: slows pacing, grounds,     → user actually feels DIFFERENT
 *               narrows focus, contains
 * 
 * Every response should create an EMOTIONAL STATE TRANSITION:
 *   PANIC → calmer
 *   OVERWHELM → grounded
 *   LONELY → emotionally connected
 *   RACING THOUGHTS → slowed down
 *   HOPELESS → slightly less stuck
 * 
 * This engine determines WHAT the AI needs to DO, not just SAY.
 * Now optimized for companion energy over clinical language.
 */

import type { EmotionAnalysis, ConversationState } from "./types";

// ===== Emotional State Detection =====

export type EmotionalState =
  | "ACTIVATED"      // fight/flight — panic, anxiety, rage, racing thoughts
  | "SHUTDOWN"       // freeze — numbness, hopelessness, dissociation
  | "STABLE"         // window of tolerance — capable of reflection
  | "MIXED";         // bouncing between states

export interface RegulationStrategy {
  emotionalState: EmotionalState;
  primaryApproach: string;
  responseGuidance: string;
  pacingNotes: string;
  sentenceFlow: string;
  avoid: string[];
  goal: string;
}

/**
 * Detect the user's emotional state from their words and feelings
 */
export function detectEmotionalState(
  emotion: EmotionAnalysis,
  userMessage: string
): EmotionalState {
  const lower = userMessage.toLowerCase();

  // ACTIVATED: fight/flight energy
  const activatedSignals = [
    "can't stop", "racing", "panic", "heart pounding", "shaking",
    "freaking out", "losing it", "can't breathe", "spiraling",
    "everything at once", "too much", "explode", "scream",
    "what if", "anxious", "terrified",
  ];

  // SHUTDOWN: freeze energy
  const shutdownSignals = [
    "numb", "empty", "nothing matters", "don't care anymore",
    "what's the point", "can't feel", "disconnected", "shut down",
    "don't want to", "no energy", "exhausted", "given up",
    "hollow", "flat", "doesn't matter", "whatever",
  ];

  const activatedCount = activatedSignals.filter((s) => lower.includes(s)).length;
  const shutdownCount = shutdownSignals.filter((s) => lower.includes(s)).length;

  // High intensity negative = activated state
  if (emotion.intensity >= 7 && emotion.sentiment === "negative") {
    if (shutdownCount > activatedCount) return "SHUTDOWN";
    return "ACTIVATED";
  }

  // Moderate distress with shutdown language
  if (shutdownCount >= 2) return "SHUTDOWN";
  if (activatedCount >= 2) return "ACTIVATED";

  // Mixed signals = bouncing between
  if (activatedCount >= 1 && shutdownCount >= 1) return "MIXED";

  // Otherwise: stable enough for reflection
  return "STABLE";
}

/**
 * Generate a regulation strategy based on emotional state
 */
export function getRegulationStrategy(
  emotionalState: EmotionalState,
  emotion: EmotionAnalysis,
  state: ConversationState
): RegulationStrategy {
  switch (emotionalState) {
    case "ACTIVATED":
      return {
        emotionalState: "ACTIVATED",
        primaryApproach: "SLOW AND GROUND",
        goal: "Move from panic/overwhelm → calmer, more contained",
        responseGuidance: `## How to Help Someone Who's Panicking

Their mind is racing. Everything feels urgent. They need you to be the calm.

What to do:
1. Use SHORT sentences. Period-separated. Not commas.
2. Start with ONE grounding statement — not a question
3. Create a "pause": "Let's just slow down for a second."
4. If they're spiraling with "what ifs" — interrupt gently: "Before we go there — stay with me right here."
5. Name ONE sensory anchor: "Can you feel your feet on the floor right now?"
6. Don't ask open-ended questions (they fuel spiraling)
7. Don't say "everything will be okay" (feels dismissive when panicking)
8. Don't list multiple things — ONE thing at a time

Example:
"Hey. Let's slow down for a second.

You're carrying a lot right now, and your mind is trying to process everything at once. That's exhausting.

Before anything else — just take one slow breath. Not deep. Just slow.

Now tell me: what's the ONE thing your brain keeps circling back to?"`,
        pacingNotes: "Slow rhythm. Short sentences. Period after each thought. Leave breathing room between paragraphs. Maximum 4-5 sentences.",
        sentenceFlow: "2-8 words per sentence where possible. Mix one longer sentence (12-15 words) for emotional warmth. Never more than one comma per sentence.",
        avoid: [
          "Open-ended questions like 'How does that make you feel?'",
          "Listing multiple options or strategies",
          "Future-focused thinking ('It will get better')",
          "'Just' language ('just breathe', 'just relax')",
          "Asking them to explain or analyze their feelings right now",
        ],
      };

    case "SHUTDOWN":
      return {
        emotionalState: "SHUTDOWN",
        primaryApproach: "GENTLY WARM",
        goal: "Move from shutdown/numbness → slightly more present and connected",
        responseGuidance: `## How to Be With Someone Who's Shut Down

They feel numb, empty, or disconnected. Not broken — just protecting themselves.

What to do:
1. Don't be enthusiastic or energetic (feels alien to them right now)
2. Be WARM but QUIET — like sitting next to someone in comfortable silence
3. Acknowledge the numbness without trying to fix it: "Sometimes feeling nothing is your body's way of protecting you."
4. Use slightly LONGER, warmer sentences — short punchy responses feel cold when someone's shut down
5. Offer small connection: "I'm here. No rush."
6. Ask ONE very specific, tiny question (not big emotional ones): "When's the last time you ate something?" or "Are you somewhere comfortable right now?"
7. Avoid demanding emotional processing — they can't access emotions right now

Example:
"You know, sometimes when everything gets too heavy, your mind just... turns the volume down on feelings. That's not broken — that's protection.

You don't have to feel anything specific right now. We can just be here.

When's the last time you had something to drink? Water, tea, anything?"`,
        pacingNotes: "Gentle, unhurried rhythm. Slightly longer sentences. Warm tone. Feels like a blanket, not a spotlight.",
        sentenceFlow: "Medium-length sentences (10-18 words). Flowing, gentle. Use ellipsis sparingly for natural pauses. Conversational warmth.",
        avoid: [
          "Excitement or forced positivity",
          "Demanding they 'open up' or 'tell me how you feel'",
          "'You need to...' directives",
          "Suggesting they're avoiding feelings",
          "Big philosophical questions",
        ],
      };

    case "MIXED":
      return {
        emotionalState: "MIXED",
        primaryApproach: "CONTAIN AND STABILIZE",
        goal: "Move from emotional chaos → contained, focused on one thing at a time",
        responseGuidance: `## How to Help Someone in Emotional Chaos

They're bouncing between emotional extremes — angry then sad, panicked then numb.

What to do:
1. Name what you see: "There's a lot happening inside right now."
2. Don't try to address everything — pick the MOST present emotion
3. Create structure: "Let's just focus on one thing."
4. Be steady and predictable — your consistency IS the help
5. Use gentle redirects when they jump between topics
6. Reflect the underlying need, not every surface emotion

Example:
"There's a lot moving through you right now. That's okay — you don't have to sort it all out.

Let's just stay with one thing. Out of everything swirling around — what feels heaviest right this second?"`,
        pacingNotes: "Steady, consistent rhythm. Not too fast, not too slow. Predictable structure. Anchoring.",
        sentenceFlow: "Medium sentences. Structurally consistent. Clear, direct, warm.",
        avoid: [
          "Matching their chaos with rapid-fire responses",
          "Trying to address multiple emotions at once",
          "Suggesting they're 'all over the place'",
          "Overwhelming with options",
        ],
      };

    case "STABLE":
    default:
      return {
        emotionalState: "STABLE",
        primaryApproach: "DEEPEN CONNECTION",
        goal: "They're regulated enough for reflection — help them understand themselves deeper",
        responseGuidance: `## How to Deepen When They're Ready

This person is stable enough to think, reflect, and engage.

This is where REAL growth happens:
1. Help them connect dots between feelings and patterns
2. Gently explore root causes: "I wonder if this connects to..."
3. Notice what they're NOT saying as much as what they ARE
4. Use their own words back to them — it creates resonance
5. It's okay to ask deeper questions here — they can handle it
6. Help them build insight: "It sounds like the anxiety isn't really about the exam — it's about not feeling ready enough."

Example:
"You know what I'm noticing? When you talk about your friends, there's this shift — like the energy changes. The anxiety gets quieter and this sadness comes in.

I wonder if the anxiety is partly about not wanting to sit with how much you miss them. Does that land at all?"`,
        pacingNotes: "Natural conversational rhythm. Can be slightly longer. Thoughtful, reflective pace.",
        sentenceFlow: "Varied. Natural. Mix of short observations and longer reflective sentences. Like a real conversation.",
        avoid: [
          "Surface-level 'that sounds hard' without going deeper",
          "Generic empathy without insight",
          "Asking questions you already have context for",
        ],
      };
  }
}

/**
 * Build the regulation prompt injection
 */
export function buildRegulationPrompt(
  emotion: EmotionAnalysis,
  state: ConversationState,
  userMessage: string
): string {
  const emotionalState = detectEmotionalState(emotion, userMessage);
  const strategy = getRegulationStrategy(emotionalState, emotion, state);

  let prompt = strategy.responseGuidance;

  prompt += `\n\n## Pacing\n${strategy.pacingNotes}`;
  prompt += `\n\n## Sentence Flow\n${strategy.sentenceFlow}`;
  prompt += `\n\n## Goal\n${strategy.goal}`;

  if (strategy.avoid.length > 0) {
    prompt += `\n\n## Avoid\n${strategy.avoid.map((a) => `- ${a}`).join("\n")}`;
  }

  return prompt;
}
