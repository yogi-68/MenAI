/**
 * Response Naturalizer — Linguistic Variation Engine
 * 
 * Prevents the AI from sounding repetitive by:
 * 1. Varying validation phrases
 * 2. Randomizing sentence starters
 * 3. Adjusting response length based on emotional state
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
  if (state === "ESCALATION" || state === "GROUNDING") {
    return "RESPONSE LENGTH: 1-3 sentences MAX. Short, steady, grounding. No essays. Be an anchor.";
  }

  // High emotion: moderate, warm
  if (emotion.intensity >= 7) {
    return "RESPONSE LENGTH: 2-4 sentences. Lead with empathy. Don't overwhelm them with words when they're already overwhelmed.";
  }

  // Validating: brief, impactful
  if (state === "VALIDATING") {
    return "RESPONSE LENGTH: 2-3 sentences. Sometimes the most powerful thing is brevity. Show you heard them. Don't over-explain.";
  }

  // Exploring: moderate
  if (state === "EXPLORING") {
    return "RESPONSE LENGTH: 3-5 sentences. One reflection + one gentle question. Natural conversational depth.";
  }

  // Reframing: moderate with care
  if (state === "REFRAMING") {
    return "RESPONSE LENGTH: 3-5 sentences. Acknowledge first, then gently reframe. Don't lecture.";
  }

  // Reflection: warm, moderate
  if (state === "REFLECTION") {
    return "RESPONSE LENGTH: 2-4 sentences. Honor their growth. Warm and genuine.";
  }

  // Default: natural conversation
  return "RESPONSE LENGTH: 2-4 sentences. Natural, like a friend. Vary between short and medium responses.";
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
    hopelessness: [
      "When it all feels pointless, everything gets heavier.",
      "That kind of hopelessness is exhausting to carry.",
      "Yeah, when nothing seems to work, it's hard to keep trying.",
      "I hear you. That's a really dark place to be in.",
    ],
  };

  return variations[emotion] || variations.sadness;
}
