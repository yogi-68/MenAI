/**
 * Regulation Engine — Emotional + Execution Intelligence
 * 
 * Two layers:
 * 1. EMOTIONAL REGULATION (invisible) — keeps user grounded during distress
 * 2. EXECUTION INTELLIGENCE — detects performance blockers and adapts
 * 
 * Emotional regulation stays invisible. The user feels understood
 * but the AI always steers toward clarity, action, and momentum.
 * 
 * Execution Intelligence detects:
 * - Procrastination patterns
 * - Avoidance behavior
 * - Distraction / idea switching
 * - Burnout signals
 * - Inconsistent habits
 * - Emotional decision-making
 * - Overthinking / analysis paralysis
 */

import type { EmotionAnalysis, ConversationState } from "./types";

// ===== Emotional State Detection =====

export type EmotionalState =
  | "ACTIVATED"      // fight/flight — panic, anxiety, rage, racing thoughts
  | "SHUTDOWN"       // freeze — numbness, hopelessness, dissociation
  | "STABLE"         // window of tolerance — capable of reflection and action
  | "MIXED"          // bouncing between states
  | "BURNOUT"        // depleted — not emotional crisis, but energy-empty
  | "SCATTERED";     // idea-switching, unfocused, procrastinating

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
    "don't want to", "given up", "hollow", "flat",
    "doesn't matter", "whatever",
  ];

  // BURNOUT: depleted, not emotional crisis
  const burnoutSignals = [
    "exhausted", "burned out", "burnout", "no energy",
    "can't keep going", "running on empty", "depleted",
    "too tired", "worn out", "drained", "overwhelmed with work",
    "grinding", "not sustainable", "breaking point",
  ];

  // SCATTERED: unfocused, procrastinating, idea-switching
  const scatteredSignals = [
    "can't focus", "distracted", "procrastinating", "keep switching",
    "new idea", "maybe I should", "I keep starting", "shiny object",
    "should I pivot", "too many things", "all over the place",
    "can't commit", "overthinking", "analysis paralysis",
    "going in circles", "scattered", "unfocused",
  ];

  const activatedCount = activatedSignals.filter((s) => lower.includes(s)).length;
  const shutdownCount = shutdownSignals.filter((s) => lower.includes(s)).length;
  const burnoutCount = burnoutSignals.filter((s) => lower.includes(s)).length;
  const scatteredCount = scatteredSignals.filter((s) => lower.includes(s)).length;

  // Burnout — distinct from emotional crisis
  if (burnoutCount >= 2) return "BURNOUT";

  // Scattered — procrastination / idea switching
  if (scatteredCount >= 2) return "SCATTERED";

  // High intensity negative = activated state
  if (emotion.intensity >= 7 && emotion.sentiment === "negative") {
    if (shutdownCount > activatedCount) return "SHUTDOWN";
    return "ACTIVATED";
  }

  // Moderate distress with shutdown language
  if (shutdownCount >= 2) return "SHUTDOWN";
  if (activatedCount >= 2) return "ACTIVATED";

  // Mixed signals
  if (activatedCount >= 1 && shutdownCount >= 1) return "MIXED";

  // Check for single burnout or scattered signals with context
  if (burnoutCount >= 1 && emotion.intensity >= 5) return "BURNOUT";
  if (scatteredCount >= 1 && emotion.intensity <= 4) return "SCATTERED";

  return "STABLE";
}

/**
 * Generate a regulation strategy based on emotional state
 */
export function getRegulationStrategy(
  emotionalState: EmotionalState,
  _emotion: EmotionAnalysis,
  _state: ConversationState
): RegulationStrategy {
  switch (emotionalState) {
    case "ACTIVATED":
      return {
        emotionalState: "ACTIVATED",
        primaryApproach: "SLOW AND GROUND",
        goal: "Move from panic/overwhelm → calmer, more contained, ready for one clear step",
        responseGuidance: `## Grounding Someone in Fight/Flight

Their mind is racing. Everything feels urgent. Be the calm.

1. Use SHORT sentences. Period-separated. Not commas.
2. Start with ONE grounding statement — not a question
3. Create a "pause": "Let's slow down for a second."
4. If spiraling with "what ifs" — interrupt gently: "Before we go there — stay with me right here."
5. Name ONE sensory anchor: "Can you feel your feet on the floor right now?"
6. Don't ask open-ended questions (they fuel spiraling)
7. After grounding: bridge to ONE actionable thing. "What's the single most important thing right now?"`,
        pacingNotes: "Slow rhythm. Short sentences. Maximum 4-5 sentences.",
        sentenceFlow: "2-8 words per sentence. Mix one longer sentence for warmth. Never more than one comma per sentence.",
        avoid: [
          "Open-ended questions like 'How does that make you feel?'",
          "Listing multiple options or strategies",
          "Future-focused thinking ('It will get better')",
          "'Just' language ('just breathe', 'just relax')",
        ],
      };

    case "SHUTDOWN":
      return {
        emotionalState: "SHUTDOWN",
        primaryApproach: "GENTLY WARM",
        goal: "Move from shutdown/numbness → slightly more present, then bridge to micro-action",
        responseGuidance: `## Being With Someone Who's Shut Down

They feel numb, empty, or disconnected. Not broken — just protecting themselves.

1. Don't be enthusiastic or energetic
2. Be WARM but QUIET — like sitting next to someone in comfortable silence
3. Acknowledge the numbness: "Sometimes your body turns the volume down on feelings. That's protection, not failure."
4. Use slightly LONGER, warmer sentences — short punchy responses feel cold here
5. Offer small connection: "I'm here. No rush."
6. Ask ONE very specific, tiny question: "When's the last time you ate?" or "Are you somewhere comfortable right now?"
7. Once connected: bridge to one tiny action. "What's ONE thing you could do in the next 10 minutes?"`,
        pacingNotes: "Gentle, unhurried rhythm. Slightly longer sentences. Warm like a blanket, not a spotlight.",
        sentenceFlow: "Medium-length sentences (10-18 words). Flowing, gentle. Use ellipsis sparingly.",
        avoid: [
          "Excitement or forced positivity",
          "Demanding they 'open up' or 'tell me how you feel'",
          "'You need to...' directives",
          "Suggesting they're avoiding feelings",
        ],
      };

    case "BURNOUT":
      return {
        emotionalState: "BURNOUT",
        primaryApproach: "ACKNOWLEDGE AND RESTRUCTURE",
        goal: "Move from depleted → validated, then create recovery plan",
        responseGuidance: `## Helping Someone Who's Burned Out

Burnout isn't weakness. It's a systems failure — they gave too much without recovery.

1. Validate first: "You're not lazy. You're depleted. There's a difference."
2. Don't push MORE action — that's what caused this
3. Help them SUBTRACT: "What can you drop this week? What's actually urgent vs. just loud?"
4. Identify the structural problem: overcommitment? perfectionism? no recovery time?
5. Create a recovery protocol: "Let's figure out the minimum viable week — what's essential, and what's noise?"
6. Normalize rest as strategy: "Recovery isn't weakness. It's how high performers sustain."
7. Bridge to execution: "Once you're recharged, you'll execute 3x faster. Let's protect your recovery."`,
        pacingNotes: "Steady, warm but strategic. Mix empathy with concrete structure.",
        sentenceFlow: "Medium sentences. Warm but purposeful. Not therapy — performance coaching.",
        avoid: [
          "Pushing more tasks or goals",
          "'Push through it' language",
          "Making them feel weak for being tired",
          "Generic 'take a break' without structure",
        ],
      };

    case "SCATTERED":
      return {
        emotionalState: "SCATTERED",
        primaryApproach: "FOCUS AND COMMIT",
        goal: "Move from scattered/unfocused → committed to ONE thing",
        responseGuidance: `## Helping Someone Who's Scattered

They're idea-switching, procrastinating, or stuck in analysis paralysis. The antidote is COMMITMENT to one thing.

1. Name the pattern: "I notice you've been exploring a lot of directions. That's your brain avoiding commitment."
2. Don't judge — normalize it: "This happens to smart people. More options = more paralysis."
3. Cut through the noise: "If you could only work on ONE thing this week, what would create the most momentum?"
4. Create specificity: Force a decision. "What's the first concrete step? Not the plan — the STEP."
5. Challenge gently: "You've started 3 things this month. What if you finished ONE?"
6. Frame commitment as freedom: "Choosing one thing isn't limiting — it's liberating. All that energy goes to one place."
7. Set accountability: "Tell me what you'll do by [time]. I'll check in."`,
        pacingNotes: "Direct, clear, slightly challenging. Not harsh — strategically firm.",
        sentenceFlow: "Short to medium. Decisive. Questions that narrow, not expand.",
        avoid: [
          "Adding more options to consider",
          "Exploring every idea they mention",
          "Being wishy-washy about direction",
          "'That's also interesting' for every new idea",
        ],
      };

    case "MIXED":
      return {
        emotionalState: "MIXED",
        primaryApproach: "CONTAIN AND STABILIZE",
        goal: "Move from emotional chaos → contained, focused on one thing at a time",
        responseGuidance: `## Helping Someone in Emotional Chaos

They're bouncing between emotional extremes — angry then sad, panicked then numb.

1. Name what you see: "There's a lot happening inside right now."
2. Don't try to address everything — pick the MOST present emotion
3. Create structure: "Let's just focus on one thing."
4. Be steady and predictable — your consistency IS the help
5. Use gentle redirects when they jump between topics
6. Once contained: "What would help you feel 10% more grounded right now?"`,
        pacingNotes: "Steady, consistent rhythm. Predictable structure. Anchoring.",
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
        primaryApproach: "STRATEGIC DEPTH",
        goal: "They're regulated — help them build clarity, strategy, and momentum",
        responseGuidance: `## Strategic Coaching When They're Ready

This person is stable. This is where REAL value happens — not comfort, but CLARITY.

Priority order:
1. UNDERSTAND their situation — listen for what's really going on
2. IDENTIFY blockers — procrastination, avoidance, unclear priorities, fear disguised as logic
3. CREATE CLARITY — help them see what matters vs. what's noise
4. GUIDE EXECUTION — specific, concrete, time-bound next steps
5. MAINTAIN MOMENTUM — connect today's action to their bigger vision

Coaching moves:
- Connect dots between their behavior and their goals
- Notice patterns: "You tend to stall when the stakes get real."
- Challenge constructively: "What are you avoiding by focusing on that?"
- Use their own words to create resonance
- Be specific: "What will you have done by Friday?"
- Bridge emotional insight to action: "That anxiety isn't random — it's telling you this matters."`,
        pacingNotes: "Natural conversational rhythm. Thoughtful, strategic. Can go deeper.",
        sentenceFlow: "Varied. Natural. Mix observations with strategic questions. Like a mentor, not a therapist.",
        avoid: [
          "Surface-level 'that sounds hard' without going deeper",
          "Generic empathy without insight or action",
          "Being vague about next steps",
          "Letting them stay in analysis mode without committing",
        ],
      };
  }
}

/**
 * Detect execution intelligence patterns from the message
 */
export function detectExecutionPatterns(userMessage: string): string[] {
  const lower = userMessage.toLowerCase();
  const patterns: string[] = [];

  // Procrastination
  if (/haven'?t started|keep putting|tomorrow|later|not yet|haven'?t gotten to/.test(lower)) {
    patterns.push("PROCRASTINATION: They may be avoiding. Explore why — is it fear, clarity, or energy?");
  }

  // Avoidance
  if (/don'?t want to think about|let'?s talk about something else|anyway|changing subject|not ready/.test(lower)) {
    patterns.push("AVOIDANCE: They're deflecting from something important. Note it, don't force it. Come back later.");
  }

  // Idea switching
  if (/new idea|what if I|maybe I should|I was thinking of|pivot|another thing/.test(lower)) {
    patterns.push("IDEA SWITCHING: They might be using new ideas to avoid executing current ones. Challenge gently.");
  }

  // Perfectionism
  if (/not good enough|needs to be perfect|not ready yet|one more thing|before I can/.test(lower)) {
    patterns.push("PERFECTIONISM: They're using 'not ready' as a shield. Remind them: done > perfect. Ship it.");
  }

  // Emotional decision-making
  if (/I feel like I should|my gut says|I just feel|something tells me/.test(lower)) {
    patterns.push("EMOTIONAL DECISIONS: Feelings are data, not directives. Help them separate emotion from strategy.");
  }

  // Comparison trap
  if (/everyone else|they're ahead|I'm behind|should be further|compared to/.test(lower)) {
    patterns.push("COMPARISON TRAP: They're measuring against others. Redirect to their own trajectory and progress.");
  }

  return patterns;
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

  // Add execution intelligence
  const executionPatterns = detectExecutionPatterns(userMessage);
  if (executionPatterns.length > 0) {
    prompt += `\n\n## Execution Intelligence — Patterns Detected\n${executionPatterns.map((p) => `- ${p}`).join("\n")}`;
  }

  return prompt;
}
