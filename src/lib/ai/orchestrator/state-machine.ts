/**
 * State Machine — Conversational state management
 * Determines what the AI should be doing based on context
 */

import type { ConversationState, EmotionAnalysis, SafetyResult } from "./types";

/**
 * Determine the conversation state based on all available signals
 */
export function determineState(params: {
  emotion: EmotionAnalysis;
  safety: SafetyResult;
  messageCount: number;
  userMessage: string;
  lastState?: ConversationState;
}): ConversationState {
  const { emotion, safety, messageCount, userMessage, lastState } = params;
  const lower = userMessage.toLowerCase();

  // ESCALATION: Safety always takes priority
  if (safety.requiresEscalation || safety.level === "critical" || safety.level === "danger") {
    return "ESCALATION";
  }

  // GROUNDING: Panic/anxiety signals
  const groundingKeywords = [
    "panic", "can't breathe", "anxiety attack", "freaking out",
    "heart racing", "dizzy", "shaking", "losing control",
  ];
  if (groundingKeywords.some((k) => lower.includes(k))) {
    return "GROUNDING";
  }

  // GOAL_SETTING: User asks for help or wants to change
  const goalKeywords = [
    "help me", "what should i do", "how do i", "i want to change",
    "i need advice", "what can i try", "suggestion", "recommend",
  ];
  if (goalKeywords.some((k) => lower.includes(k))) {
    return "GOAL_SETTING";
  }

  // REFRAMING: Negative thought patterns detected
  const reframingSignals = [
    "i always", "i never", "nobody", "everyone hates",
    "i'm worthless", "nothing works", "i can't do anything",
    "what's the point", "i'm a failure",
  ];
  if (reframingSignals.some((k) => lower.includes(k))) {
    return "REFRAMING";
  }

  // REFLECTION: End of session or user is summarizing
  const reflectionKeywords = [
    "i feel better", "thank you", "that helped", "i learned",
    "looking back", "i realize", "i've been thinking",
  ];
  if (reflectionKeywords.some((k) => lower.includes(k))) {
    return "REFLECTION";
  }

  // VALIDATING: High emotion needs validation first
  if (emotion.intensity >= 6 && emotion.sentiment === "negative") {
    // If we were already validating, move to exploring
    if (lastState === "VALIDATING") return "EXPLORING";
    return "VALIDATING";
  }

  // EXPLORING: After initial validation, explore deeper
  if (lastState === "VALIDATING" || lastState === "LISTENING") {
    if (messageCount > 2) return "EXPLORING";
  }

  // LISTENING: Default — absorb what the user says
  return "LISTENING";
}

/**
 * Get state-specific instructions for the prompt builder
 */
export function getStateInstructions(state: ConversationState): string {
  const instructions: Record<ConversationState, string> = {
    LISTENING:
      "You are in LISTENING mode. Focus on truly hearing what the user is saying. Reflect their words back. Ask one gentle follow-up question. Don't offer solutions yet.",
    VALIDATING:
      "You are in VALIDATING mode. The user is experiencing strong emotions. Your ONLY job is to validate their feelings. Say things like 'That sounds incredibly difficult' and 'Your feelings are completely valid'. Do NOT offer advice or reframe yet.",
    EXPLORING:
      "You are in EXPLORING mode. Gently explore what the user is going through with thoughtful questions. Help them articulate their feelings. Ask 'What does that feel like?' or 'When did you first notice this?'",
    REFRAMING:
      "You are in REFRAMING mode. The user is stuck in a negative thought pattern. Gently and respectfully challenge the thought without being dismissive. Use phrases like 'I hear that you feel that way. I wonder if there might be another way to look at this?' Never lecture.",
    GROUNDING:
      "You are in GROUNDING mode. The user may be experiencing anxiety or panic. Guide them through a calming exercise NOW. Start with: 'Let's pause for a moment together. Take a deep breath with me...' Then use the 5-4-3-2-1 grounding technique.",
    GOAL_SETTING:
      "You are in GOAL SETTING mode. Help the user identify ONE small, achievable action they can take today. Make it specific and manageable. 'What would be one tiny step that feels doable right now?'",
    REFLECTION:
      "You are in REFLECTION mode. Help the user appreciate their progress and insights. Acknowledge their growth. 'It sounds like you're developing real awareness about this.' Be encouraging and warm.",
    ESCALATION:
      "You are in ESCALATION mode. The user may be in crisis. Express genuine care and concern. Provide crisis resources immediately. Stay calm and supportive. Do NOT try to solve the problem yourself — direct them to professional help.",
  };

  return instructions[state];
}
