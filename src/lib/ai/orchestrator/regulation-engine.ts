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
 */

import type { EmotionAnalysis, ConversationState } from "./types";

// ===== Nervous System State Detection =====

export type NervousSystemState =
  | "HYPERAROUSAL"    // fight/flight — panic, anxiety, rage, racing thoughts
  | "HYPOAROUSAL"    // freeze/shutdown — numbness, hopelessness, dissociation
  | "WINDOW"          // window of tolerance — capable of reflection
  | "DYSREGULATED";   // bouncing between states

export interface RegulationStrategy {
  nervousSystemState: NervousSystemState;
  primaryTechnique: string;
  responseRules: string;
  pacingInstructions: string;
  sentenceStructure: string;
  forbiddenActions: string[];
  emotionalGoal: string;
}

/**
 * Detect the user's nervous system state from emotional data
 */
export function detectNervousSystemState(
  emotion: EmotionAnalysis,
  userMessage: string
): NervousSystemState {
  const lower = userMessage.toLowerCase();

  // HYPERAROUSAL indicators: fight/flight activation
  const hyperSignals = [
    "can't stop", "racing", "panic", "heart pounding", "shaking",
    "freaking out", "losing it", "can't breathe", "spiraling",
    "everything at once", "too much", "explode", "scream",
    "what if", "what if", "anxious", "terrified",
  ];

  // HYPOAROUSAL indicators: freeze/shutdown
  const hypoSignals = [
    "numb", "empty", "nothing matters", "don't care anymore",
    "what's the point", "can't feel", "disconnected", "shut down",
    "don't want to", "no energy", "exhausted", "given up",
    "hollow", "flat", "doesn't matter", "whatever",
  ];

  const hyperCount = hyperSignals.filter((s) => lower.includes(s)).length;
  const hypoCount = hypoSignals.filter((s) => lower.includes(s)).length;

  // High intensity negative = hyperarousal
  if (emotion.intensity >= 7 && emotion.sentiment === "negative") {
    if (hypoCount > hyperCount) return "HYPOAROUSAL";
    return "HYPERAROUSAL";
  }

  // Moderate distress with shutdown language
  if (hypoCount >= 2) return "HYPOAROUSAL";
  if (hyperCount >= 2) return "HYPERAROUSAL";

  // Mixed signals = dysregulated
  if (hyperCount >= 1 && hypoCount >= 1) return "DYSREGULATED";

  // Otherwise: in window of tolerance
  return "WINDOW";
}

/**
 * Generate a regulation strategy based on nervous system state
 */
export function getRegulationStrategy(
  nervousState: NervousSystemState,
  emotion: EmotionAnalysis,
  state: ConversationState
): RegulationStrategy {
  switch (nervousState) {
    case "HYPERAROUSAL":
      return {
        nervousSystemState: "HYPERAROUSAL",
        primaryTechnique: "SLOW AND GROUND",
        emotionalGoal: "Move from panic/overwhelm → calmer, more contained",
        responseRules: `## REGULATION: Calming a Hyperaroused Nervous System
Your job is NOT to empathize and move on. Your job is to SLOW THEIR NERVOUS SYSTEM DOWN.

How to do this through text:
1. Use SHORT sentences. Period-separated. Not commas.
2. Start with ONE grounding statement — not a question
3. Create a "pause" in the conversation: "Let's just slow down for a second."
4. If they're spiraling with "what ifs" — interrupt the loop: "Before we go there — stay with me right here."
5. Name ONE sensory anchor: "Can you feel your feet on the floor right now?"
6. Do NOT ask open-ended questions (they fuel spiraling)
7. Do NOT say "everything will be okay" (their nervous system rejects it)
8. Do NOT list multiple things — ONE thing at a time

Example good response:
"Hey. Let's slow down for a second.

You're carrying a lot right now, and your mind is trying to process everything at once. That's exhausting.

Before anything else — just take one slow breath. Not deep. Just slow.

Now tell me: what's the ONE thing your brain keeps circling back to?"`,
        pacingInstructions: "Slow rhythm. Short sentences. Period after each thought. Leave breathing room between paragraphs. Maximum 4-5 sentences.",
        sentenceStructure: "2-8 words per sentence where possible. Mix one longer sentence (12-15 words) for emotional warmth. Never more than one comma per sentence.",
        forbiddenActions: [
          "No open-ended questions like 'How does that make you feel?'",
          "No listing multiple options or strategies",
          "No future-focused thinking ('It will get better')",
          "No 'just' language ('just breathe', 'just relax')",
          "No asking them to explain or analyze their feelings right now",
        ],
      };

    case "HYPOAROUSAL":
      return {
        nervousSystemState: "HYPOAROUSAL",
        primaryTechnique: "GENTLY ACTIVATE",
        emotionalGoal: "Move from shutdown/numbness → slightly more present and connected",
        responseRules: `## REGULATION: Warming a Shutdown Nervous System
This person is in freeze mode. They feel numb, empty, or disconnected.

Your job is to GENTLY bring them back to feeling — not force it.

How:
1. Don't be enthusiastic or energetic (it feels alien to them right now)
2. Be WARM but QUIET — like sitting next to someone in comfortable silence
3. Acknowledge the numbness without trying to fix it: "Sometimes feeling nothing is your body's way of protecting you."
4. Use slightly LONGER, warmer sentences — short punchy responses feel cold to someone who's shut down
5. Offer small connection: "I'm here. No rush."
6. Ask ONE very specific, tiny question (not big emotional ones): "When's the last time you ate something?" or "Are you somewhere comfortable right now?"
7. Avoid demanding emotional processing — they can't access emotions right now

Example good response:
"You know, sometimes when everything gets too heavy, your brain just... turns the volume down on feelings. That's not broken — that's protection.

You don't have to feel anything specific right now. We can just be here.

When's the last time you had something to drink? Water, tea, anything?"`,
        pacingInstructions: "Gentle, unhurried rhythm. Slightly longer sentences than hyperarousal. Warm tone. Feels like a blanket, not a spotlight.",
        sentenceStructure: "Medium-length sentences (10-18 words). Flowing, gentle. Use ellipsis sparingly for natural pauses. Conversational warmth.",
        forbiddenActions: [
          "No excitement or forced positivity",
          "No demanding they 'open up' or 'tell me how you feel'",
          "No 'you need to...' directives",
          "No suggesting they're avoiding feelings",
          "No big philosophical questions",
        ],
      };

    case "DYSREGULATED":
      return {
        nervousSystemState: "DYSREGULATED",
        primaryTechnique: "CONTAIN AND STABILIZE",
        emotionalGoal: "Move from emotional chaos → contained, focused on one thing at a time",
        responseRules: `## REGULATION: Containing a Dysregulated State
This person is bouncing between emotional extremes — angry then sad, panicked then numb.

Your job is CONTAINMENT — help them hold ONE thing at a time.

How:
1. Name what you see: "There's a lot happening inside right now."
2. Don't try to address everything — pick the MOST present emotion
3. Create structure: "Let's just focus on one thing."
4. Be steady and predictable — your consistency IS the regulation
5. Use gentle redirects when they jump between topics
6. Reflect the underlying need, not every surface emotion

Example good response:
"There's a lot moving through you right now. That's okay — you don't have to sort it all out.

Let's just stay with one thing. Out of everything swirling around — what feels heaviest right this second?"`,
        pacingInstructions: "Steady, consistent rhythm. Not too fast, not too slow. Predictable structure. Anchoring.",
        sentenceStructure: "Medium sentences. Structurally consistent. Clear, direct, warm.",
        forbiddenActions: [
          "No matching their chaos with rapid-fire responses",
          "No trying to address multiple emotions at once",
          "No suggesting they're 'all over the place'",
          "No overwhelming with options",
        ],
      };

    case "WINDOW":
    default:
      return {
        nervousSystemState: "WINDOW",
        primaryTechnique: "DEEPEN CONNECTION",
        emotionalGoal: "They're regulated enough for reflection — help them understand themselves deeper",
        responseRules: `## REGULATION: Deepening When Regulated
This person is in their window of tolerance — they can think, reflect, and engage.

This is where REAL therapeutic work happens:
1. Help them connect dots between feelings and patterns
2. Gently explore root causes: "I wonder if this connects to..."
3. Notice what they're NOT saying as much as what they ARE
4. Use their own words back to them — it creates resonance
5. It's okay to ask deeper questions here — they can handle it
6. Help them build insight: "It sounds like the anxiety isn't really about the exam — it's about not feeling ready enough."

Example good response:
"You know what I'm noticing? When you talk about your friends, there's this shift — like the energy changes. The anxiety gets quieter and this sadness comes in.

I wonder if the anxiety is partly about not wanting to sit with how much you miss them. Does that land at all?"`,
        pacingInstructions: "Natural conversational rhythm. Can be slightly longer. Thoughtful, reflective pace.",
        sentenceStructure: "Varied. Natural. Mix of short observations and longer reflective sentences. Like a real conversation.",
        forbiddenActions: [
          "No surface-level 'that sounds hard' without going deeper",
          "No generic empathy without insight",
          "No asking questions you already have context for",
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
  const nervousState = detectNervousSystemState(emotion, userMessage);
  const strategy = getRegulationStrategy(nervousState, emotion, state);

  let prompt = strategy.responseRules;

  prompt += `\n\n## Pacing\n${strategy.pacingInstructions}`;
  prompt += `\n\n## Sentence Structure\n${strategy.sentenceStructure}`;
  prompt += `\n\n## Emotional Goal\n${strategy.emotionalGoal}`;

  if (strategy.forbiddenActions.length > 0) {
    prompt += `\n\n## DO NOT\n${strategy.forbiddenActions.map((a) => `- ${a}`).join("\n")}`;
  }

  return prompt;
}
