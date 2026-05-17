/**
 * State Machine — Conversational State Management
 * 
 * This is NOT just labels. Each state fundamentally changes HOW the AI responds:
 * - Sentence length
 * - Emotional tone
 * - Question frequency
 * - Validation depth
 * - Technique selection
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

  // GROUNDING: Panic/anxiety signals — needs IMMEDIATE calming
  const groundingKeywords = [
    "panic", "can't breathe", "anxiety attack", "freaking out",
    "heart racing", "dizzy", "shaking", "losing control",
    "overwhelmed", "spiraling", "everything is too much",
    "can't stop crying", "hyperventilating", "going to throw up",
  ];
  if (groundingKeywords.some((k) => lower.includes(k))) {
    return "GROUNDING";
  }

  // EMOTIONAL_HOLDING: Deep exhaustion/vulnerability — needs silence, not questions
  const holdingKeywords = [
    "i don't know anymore", "i'm so tired", "i can't", "nothing helps",
    "i don't even know", "i'm exhausted", "i give up", "no energy left",
    "too tired", "can't do this", "completely drained", "worn out",
  ];
  if (holdingKeywords.some((k) => lower.includes(k)) || emotion.intensity >= 8) {
    return "EMOTIONAL_HOLDING";
  }

  // REFRAMING: Cognitive distortions — absolute/catastrophic thinking
  const reframingSignals = [
    "i always", "i never", "nobody cares", "everyone hates",
    "i'm worthless", "nothing works", "i can't do anything",
    "what's the point", "i'm a failure", "i'm broken",
    "nobody would miss me", "nothing will change",
    "i'll never be", "no one understands", "i'm not enough",
  ];
  if (reframingSignals.some((k) => lower.includes(k))) {
    return "REFRAMING";
  }

  // GOAL_SETTING: User is ready for action
  const goalKeywords = [
    "help me", "what should i do", "how do i", "i want to change",
    "i need advice", "what can i try", "suggestion", "recommend",
    "how can i", "i'm ready to", "i want to start",
  ];
  if (goalKeywords.some((k) => lower.includes(k))) {
    return "GOAL_SETTING";
  }

  // REFLECTION: User is processing or showing growth
  const reflectionKeywords = [
    "i feel better", "thank you", "that helped", "i learned",
    "looking back", "i realize", "i've been thinking",
    "i noticed", "i understand now", "makes sense",
  ];
  if (reflectionKeywords.some((k) => lower.includes(k))) {
    return "REFLECTION";
  }

  // VALIDATING: High negative emotion — validate FIRST before anything
  if (emotion.intensity >= 6 && emotion.sentiment === "negative") {
    if (lastState === "VALIDATING") return "EXPLORING";
    return "VALIDATING";
  }

  // EXPLORING: After validation, go deeper
  if (lastState === "VALIDATING" || (lastState === "LISTENING" && messageCount > 2)) {
    return "EXPLORING";
  }

  // LISTENING: Default — absorb, reflect, be present
  return "LISTENING";
}

/**
 * Get state-specific instructions that fundamentally change response style
 */
export function getStateInstructions(state: ConversationState): string {
  const instructions: Record<ConversationState, string> = {
    LISTENING: `You're fully present. Your only job is to HEAR them.
- Reflect back what they said in your own words (not parroting)
- Ask ONE gentle follow-up question
- Don't offer solutions, techniques, or advice yet
- Keep it short: 2-3 sentences
- Example: "It sounds like work has been grinding you down this week. What's been the heaviest part?"`,

    VALIDATING: `This person is hurting. Your job right now is to make them feel heard and not alone.
- Don't offer advice, reframe thoughts, or suggest techniques
- Don't ask "what would you like to do about it"
- Validate with specific words, not generic: "That sounds exhausting" not "Your feelings are valid"
- Match the weight of what they shared
- Keep it to 1-3 sentences. Sometimes less is more.
- Examples:
  "Yeah, that's a lot to carry."
  "Of course you feel that way — that situation is genuinely hard."
  "That sounds really painful. I'm glad you told me."`,

    EXPLORING: `You've validated. Now gently explore what's underneath.
- Ask questions that help them understand their own feelings
- Look for the core driver — what's really hurting?
- Connect dots: loneliness + isolation = social pain. Anxiety + sleeplessness = burnout.
- Don't interrogate. One thoughtful question is enough.
- Examples:
  "When that feeling hits, what's the first thought that comes with it?"
  "It sounds like the loneliness is connected to losing those friendships. Does that feel right?"`,

    REFRAMING: `They're stuck in all-or-nothing thinking. Be gentle.
- NEVER lecture about cognitive distortions
- NEVER say "that's a cognitive distortion"
- Instead, gently introduce doubt: "I hear you. But I'm curious — has there ever been a time when that wasn't true?"
- Keep it conversational, not educational
- If they push back, don't insist. Return to validating.
- Examples:
  "When you say 'nobody cares' — is that how it feels right now, or do you think it's always true?"
  "That 'I always fail' thought sounds so heavy. What about the time you told me about [reference past context]?"`,

    GROUNDING: `They may be panicking, spiraling, or dissociating. Be an anchor.
- Use very short sentences
- Be steady and calm — you are their anchor right now
- Start with a breath or sensory check
- Don't ask open-ended questions. Give gentle direction.
- Examples:
  "Hey. Let's slow down. Take one slow breath — in through your nose, out through your mouth."
  "I'm right here. Can you tell me 3 things you can see around you right now?"
  "Put your feet flat on the floor. Feel the weight of your body. You're here. You're safe."`,

    EMOTIONAL_HOLDING: `This person is emotionally exhausted. They need you to HOLD space — not ask, not probe, not solve.

Your job right now is pure emotional resonance and presence:
- NO follow-up questions
- NO "What do you think you need?" or "How can I help?"
- Just reflect back their exhaustion with warmth and specificity
- Let them feel accompanied in the heaviness
- Sometimes adding a gentle rhetorical question at the end is okay, but never one that demands a response

Examples:
  "That sounds emotionally exhausting. You've been carrying this in your head for way too long, haven't you?"
  "Yeah... that kind of tiredness isn't just physical. It's like your mind and heart are both worn down."
  "You don't have to know what to do right now. Sometimes not knowing is all you can manage, and that's okay."
  
Keep it shorter. Warmer. No pressure. Just... there.`,

    GOAL_SETTING: `They want to do something about it. Help them find ONE small step.
- Make it micro — tiny enough that it can't fail
- Be specific: "text one friend today" not "reach out to people"
- Acknowledge that taking action when you're struggling is brave
- Examples:
  "What's the tiniest step that feels doable today? Even something that takes 2 minutes."
  "Sometimes just opening the curtains or drinking water is enough. What feels manageable right now?"`,

    REFLECTION: `They're processing, growing, or expressing gratitude. Honor it.
- Don't rush to the next thing
- Acknowledge their growth specifically
- Help them see how far they've come
- Keep it warm and genuine — not performative
- Examples:
  "You're noticing patterns now. That kind of self-awareness is real progress."
  "The fact that you can articulate this so clearly? That's growth."`,

    ESCALATION: `This person may be in danger. Be steady. Be real. Don't perform.
- Express genuine concern in plain words
- Ask directly: "Are you safe right now?"
- Share resources: 988 Lifeline (call/text), Crisis Text Line (text HELLO to 741741)
- Stay with them. Don't lecture. Don't panic. Be the calm in their storm.
- Keep sentences very short.
- Examples:
  "I hear you, and I'm really concerned right now. Are you safe?"
  "You matter. Right now, please reach out to someone who can help: call or text 988."`,
  };

  return instructions[state];
}
