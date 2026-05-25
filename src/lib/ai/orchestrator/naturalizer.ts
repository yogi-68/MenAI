/**
 * Response Naturalizer — Linguistic Variation Engine
 * 
 * Prevents the AI from sounding repetitive by:
 * 1. Varying validation phrases
 * 2. Randomizing sentence starters
 * 3. Adjusting response length based on state and emotion
 * 4. Adding natural conversational rhythm
 */

import type { ConversationState, EmotionAnalysis } from "./types";

/**
 * Get a dynamic response length instruction based on state and emotion
 */
export function getResponseLengthGuidance(
  state: ConversationState,
  emotion: EmotionAnalysis
): string {
  // Crisis: very short, grounding
  if (state === "ESCALATION") {
    return "RESPONSE LENGTH: 1-3 sentences MAX. Short, steady, grounding. No essays. Be an anchor.";
  }

  // Planning: can be longer — structured output
  if (state === "PLANNING") {
    return "RESPONSE LENGTH: Medium to long. Structured output with clear sections. Use bullet points or numbered lists for tasks. Make it scannable and actionable.";
  }

  // Founder coaching: medium to deep — strategic depth
  if (state === "FOUNDER_COACHING" || state === "STRATEGIC_THINKING") {
    return "RESPONSE LENGTH: 4-8 sentences. Go deep on strategy. Be specific. Reference their product/business context. Challenge assumptions.";
  }

  // Accountability: direct and concise
  if (state === "ACCOUNTABILITY") {
    return "RESPONSE LENGTH: 2-5 sentences. Be direct. Ask about specific commitments. Celebrate or explore what happened. Always end with a forward-looking question.";
  }

  // Execution review: warm celebration + bridging
  if (state === "EXECUTION_REVIEW") {
    return "RESPONSE LENGTH: 3-5 sentences. Celebrate specifically. Connect to bigger picture. Bridge to next steps naturally.";
  }

  // High emotion: moderate, warm
  if (emotion.intensity >= 7) {
    return "RESPONSE LENGTH: 2-4 sentences. Lead with empathy. Don't overwhelm them with words when they're already overwhelmed.";
  }



  // Exploring: moderate
  if (state === "EXPLORING") {
    return "RESPONSE LENGTH: 3-5 sentences. One reflection + one focused question. Natural conversational depth.";
  }



  // Goal setting: moderate with specificity
  if (state === "GOAL_SETTING") {
    return "RESPONSE LENGTH: 3-6 sentences. Make it concrete. Push for specifics. SMART goals.";
  }

  // Reflection: warm, moderate
  if (state === "REFLECTION") {
    return "RESPONSE LENGTH: 2-4 sentences. Honor their growth. Warm and genuine.";
  }

  // Default: natural conversation
  return "RESPONSE LENGTH: 2-5 sentences. Natural, like a mentor. Adapt length to what's needed — shorter for clarity, longer for depth.";
}

/**
 * Generate anti-repetition instructions to prevent template language
 */
export function getAntiRepetitionInstructions(
  recentResponses: string[]
): string {
  const banned: string[] = [];

  // Check what phrases were used recently
  const recentText = recentResponses.join(" ").toLowerCase();

  if (recentText.includes("that sounds")) {
    banned.push("'That sounds...' — you just used this. Try: 'Yeah, that's...' or 'I can see why...'");
  }
  if (recentText.includes("your feelings are valid") || recentText.includes("completely valid")) {
    banned.push("'valid' — overused. Try: 'That makes sense' or 'Of course you feel that way'");
  }
  if (recentText.includes("i'm here for you")) {
    banned.push("'I'm here for you' — just used. Try: 'I'm not going anywhere' or just be present without saying it");
  }
  if (recentText.includes("it sounds like")) {
    banned.push("'It sounds like...' — vary your reflections. Try: 'So what you're saying is...' or 'If I'm hearing you right...'");
  }
  if (recentText.includes("would you like to")) {
    banned.push("'Would you like to...' — too formal. Try: 'Want to try...' or 'How about we...'");
  }
  if (recentText.includes("you got this")) {
    banned.push("'You got this' — generic motivation. Be specific about WHY you believe in them.");
  }
  if (recentText.includes("that's great") || recentText.includes("that's amazing")) {
    banned.push("'That's great/amazing' — be specific about WHAT is great. Name it.");
  }
  if (recentText.includes("let's break")) {
    banned.push("'Let's break it down' — you just used this. Try: 'Here's how I'd approach it' or 'What if we focus on...'");
  }

  if (banned.length === 0) return "";

  return `\n## Phrases to AVOID This Turn (you used them recently)\n${banned.map((b) => `- ${b}`).join("\n")}`;
}

/**
 * Get varied validation phrases for different emotional contexts
 */
export function getValidationVariations(emotion: string): string[] {
  const variations: Record<string, string[]> = {
    sadness: [
      "That's a lot of weight to carry.",
      "Yeah, that's genuinely hard.",
      "It makes sense you're feeling that way.",
      "That sounds really heavy right now.",
    ],
    anxiety: [
      "That sounds exhausting — the constant worry.",
      "Anxiety can make everything feel urgent and overwhelming.",
      "Yeah, when your mind won't stop racing, it's brutal.",
      "That's a lot of noise in your head right now.",
    ],
    loneliness: [
      "Feeling disconnected like that is really painful.",
      "That kind of loneliness hits different at night.",
      "Missing people you care about — that's a deep ache.",
      "Yeah, being alone with heavy thoughts is rough.",
    ],
    anger: [
      "That's frustrating. Makes sense you're angry.",
      "Yeah, that would piss anyone off.",
      "Anger usually shows up when something matters to you.",
      "That's a lot of built-up frustration.",
    ],
    fear: [
      "That sounds scary.",
      "Fear can make everything feel bigger than it is.",
      "Yeah, not knowing what's coming is really unsettling.",
      "That uncertainty is hard to sit with.",
    ],
    frustration: [
      "That kind of friction wears you down over time.",
      "Being stuck when you know what you want is genuinely maddening.",
      "Makes sense you're frustrated — this has been dragging on.",
      "That's the kind of thing that builds up if you don't address it.",
    ],
    burnout: [
      "You've been running too hard for too long.",
      "That exhaustion isn't weakness — it's your body saying 'enough.'",
      "Burnout doesn't mean you failed. It means you gave too much without recovery.",
      "You're not lazy. You're depleted. There's a difference.",
    ],
    hopelessness: [
      "When it all feels pointless, everything gets heavier.",
      "That kind of hopelessness is exhausting to carry.",
      "Yeah, when nothing seems to work, it's hard to keep trying.",
      "I hear you. That's a really dark place to be in.",
    ],
  };

  return variations[emotion] || variations.sadness;
}
