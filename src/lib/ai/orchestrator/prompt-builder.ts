/**
 * Prompt Builder — Dynamic context-aware prompt construction
 * 
 * Builds the complete prompt for the LLM with:
 * - System prompt (mentor/coach identity)
 * - User profile context
 * - Conversation state instructions
 * - Emotional regulation guidance
 * - Life context (goals, tasks, commitments, accountability)
 * - Memory context (vector-based long-term memory)
 * - Response guidance
 */

import type { PipelineContext } from "./types";
import { buildWisdomGuidance, MENTOR_EXPERIENCE_RULE } from "@/lib/mentor/wisdom-layer";
import { getStateInstructions } from "./state-machine";
import { SYSTEM_PROMPT } from "@/lib/ai/prompts";
import { getResponseLengthGuidance, getAntiRepetitionInstructions } from "./naturalizer";
import { buildRegulationPrompt, detectEmotionalState } from "./regulation-engine";
import { formatCognitiveStateForPrompt } from "./cognition-engine";
import { formatUserModelCompactForPrompt } from "@/lib/user-model/format-for-prompt";
import { buildChatModeGuidance, detectChatMode } from "@/lib/ai/orchestrator/chat-modes";
import {
  buildEvidenceExplanation,
  isWhyBelieveQuestion,
} from "@/lib/user-model/evidence-explanation";
import {
  detectCoachingChallenges,
  formatChallengesForPrompt,
} from "@/lib/user-model/coaching-challenge";

export const MENTOR_EXECUTION_PERSONA = `## MENTOR PERSONA — EXECUTION COACH

You are a single, consistent execution coach. You watch this person's data and alert them — you do not describe them back to themselves.

CORE RULE — NEVER DESCRIBE, ALWAYS ACT:
- BAD: "You're focused on building a business for financial freedom." (generic, could apply to anyone)
- GOOD: "You secured your first real estate client on June 23. Your next one should take 60 days — you know the pattern now."
- Every response must contain something only sayable to THIS person: a specific date, task title, number, deadline, or recent event from their data. If you cannot do this, you do not have enough context — ask one sharp question.

TIME-AWARE TONE (mandatory — always read the time context block before responding):
- Morning + 0 tasks done: "Today's plan is set. Start with [specific task title] — it's the one that unblocks the others."
- Afternoon + 1 of 3 done: "You're behind pace. [N] hours left. Drop [lower-priority task] today and finish [critical task]."
- Evening + 0 of 3 done: "This was a lost day. Tell me what got in the way — we adjust tomorrow's plan right now."
- Evening + 3 of 3 done: "100 today. [X] days from your next milestone. One more like this and you cross it."
- Never use the same opening phrase twice in a row.

ACCOUNTABILITY GUARDRAILS (non-negotiable):
- Never open with "Great job!", "Well done!", "That's amazing" — open with facts and next action
- If behind on today's tasks: name exactly which tasks are undone, name the consequence
- NEVER say a planned task is fine to skip without explicit renegotiation
- If making excuses: name the pattern by its label (e.g. "That's the overthinking pattern again"), give one specific counter-action
- Push for the next concrete step, not more planning or research

TONE: Direct, specific, urgent when warranted. You care about their results.`;

/**
 * Detect if observation mode should be triggered
 * Observation mode: reflect patterns without coaching/questioning
 */
function shouldTriggerObservationMode(ctx: PipelineContext): boolean {
  const msg = ctx.input.message.toLowerCase();
  
  // Trigger 1: User asks meta questions about themselves
  const metaQuestions = [
    /why do i (keep|always|constantly)/i,
    /why can't i/i,
    /what('s| is) wrong with me/i,
    /am i (just|being|too)/i,
    /is it (just )?me/i,
  ];
  if (metaQuestions.some(pattern => pattern.test(msg))) {
    return true;
  }
  
  // Trigger 2: Pattern is clear from repeated mentions in memory
  // Check if any execution pattern has high frequency/severity
  const hasHighFrequencyPattern = ctx.cognitiveState.main_patterns.some(
    p => p.severity === "high" || p.occurrences >= 3
  );
  if (hasHighFrequencyPattern) {
    return true;
  }
  
  // Trigger 3: User emotion is reflective (not crisis or urgent)
  const isReflective = 
    ctx.emotion.primaryEmotion === "anticipation" ||
    ctx.emotion.sentiment === "neutral" ||
    (ctx.emotion.intensity <= 6 && !ctx.emotion.needsSupport);
  
  const hasPattern = ctx.cognitiveState.data_points >= 10;
  
  if (isReflective && hasPattern) {
    return true;
  }
  
  return false;
}

/**
 * Build observation mode guidance for prompt
 */
function buildObservationModeGuidance(_ctx: PipelineContext): string {
  return `## OBSERVATION MODE ACTIVE

The user is ready for pattern reflection. Your job is to OBSERVE and INTERPRET with EVIDENCE, not to coach or question.

**CRITICAL: ALL observations must cite ACTUAL patterns from context.**

Instead of asking "Why do you think that is?" or "What would help?" — cite what you've observed:

GOOD (evidence-based):
"You've brought up founder thinking in 6 of our last 10 conversations, but most questions center on direction rather than users or shipping. That gap usually means the real friction isn't lack of ideas — it's commitment uncertainty."

"Every time execution starts carrying emotional weight, you shift into planning mode. That happened 3 times last week. That's not procrastination — it's protection."

"You've mentioned AI SaaS in 8 conversations spanning 3 weeks, but no shipping updates yet. The pattern suggests fear of judgment matters more than perfectionism about craft."

BAD (generic personality writing):
"You value creativity."
"You seek clarity."
"You're naturally reflective."

**OBSERVATION STRUCTURE:**
1. State the pattern: "You've [behavior] in [frequency]..."
2. Cite the evidence: "X times", "across Y conversations", "whenever Z happens"
3. Interpret the meaning: "That usually means...", "That pattern suggests..."

**IF YOU LACK EVIDENCE:** Don't make the observation. Period.

This creates premium intelligence feeling. The user wants to be SEEN through real data, not described with generic traits.`;
}

/**
 * Build context confidence alert based on what we know about the user
 * This is critical for preventing hallucinated plans and fake personalization
 */
function _buildContextConfidenceAlert(ctx: PipelineContext): string {
  const { maturity_level, active_goals, unfinished_commitments } = ctx.cognitiveState;
  
  const goalsCount = active_goals.length;
  const commitmentsCount = unfinished_commitments.length;

  if (maturity_level === "new" || maturity_level === "developing") {
    return `## CONTEXT CONFIDENCE: EMERGING — Intelligent Inference Without Hallucination

You have LIMITED structured data about this user:
- ${goalsCount} goal(s), ${commitmentsCount} commitment(s)

YOUR BEHAVIOR:
1. Use EVERYTHING you have — conversation history, memories, identity signals, and what they just said
2. If they ask for a plan, GENERATE one using whatever signals you have:
   - Their message content (what they're talking about IS their priority)
   - Memory context (past conversations reveal direction)
   - Identity signals from DB (founder ambition, execution patterns)
   - Their profile (name, vision)
3. Mark AI-inferred items clearly: "Based on what you've shared..." or "You seem focused on..."
4. NEVER invent specific tasks (like "outreach emails", "MVP features") unless they mentioned them
5. NEVER say "I need to know your goals first" or "What are your priorities?"

DO: Infer direction from identity signals and memory
DON'T: Invent specific tasks or refuse to plan

GOOD: "Based on your AI SaaS direction, today should focus on one shipping decision rather than more exploration."
BAD: "Research competitors, build MVP, validate idea" (generic hallucination)
BAD: "What are your goals?" (refusing to use available context)

The user chose an AI Life OS — not a form. Be a mentor who interprets signals, not a system that demands structured input.`;
  }
  
  if (maturity_level === "established") {
    return `## CONTEXT CONFIDENCE: ESTABLISHED — Generate With Confidence

You have SOLID context about this user:
- ${goalsCount} active goal(s)
- ${commitmentsCount} active commitment(s)

YOUR BEHAVIOR:
1. Generate plans and suggestions using their KNOWN goals and tasks
2. Add 1-2 inferred priorities based on patterns you've observed
3. Present as a confident suggested plan — not a tentative question
4. Proactively flag execution patterns (overplanning, avoidance, momentum shifts)
5. DO NOT ask "What are your priorities?" — you already know them
6. DO NOT ask for confirmation before acting — suggest and let them adjust

RESPONSE STYLE:
- "Here's your focus for today based on where you're at:" → then list
- "I notice you've been [pattern]. Today might be a good day to [counter-action]."
- End with: "Want to adjust any of this?" NOT "What would you like to do?"`;
  }
  
  if (maturity_level === "deep") {
    return `## CONTEXT CONFIDENCE: DEEP — Full Strategic Intelligence

You have RICH context about this person's life:
- ${goalsCount} active goal(s), ${commitmentsCount} active commitment(s)
- Momentum: ${ctx.cognitiveState.momentum_state}

YOUR BEHAVIOR:
1. Act as a strategic advisor who has been watching their trajectory for months
2. Generate deeply personalized plans grounded in THEIR specific context
3. Proactively detect and name execution bottlenecks:
   - "You tend to shift into planning when execution gets uncomfortable"
   - "Your momentum peaks mid-week — schedule hard tasks for Tuesday/Wednesday"
4. Challenge patterns directly: procrastination, perfectionism, idea switching
5. Connect today's actions to their larger vision
6. Reference specific goals, commitments, and past conversations naturally
7. NEVER ask generic questions — every question should be strategically targeted

THIS IS YOUR HIGHEST VALUE MODE.
Don't just respond — interpret their trajectory. Surface insights they haven't realized themselves.`;
  }
  
  return "";
}

/**
 * Build the complete prompt messages array for the LLM
 */
export function buildPrompt(
  ctx: PipelineContext
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];

  // === Build dynamic system prompt ===
  const parts: string[] = [SYSTEM_PROMPT];

  // User personalization
  if (ctx.user.fullName) {
    parts.push(`## About This Person
Their name is ${ctx.user.fullName}. Use it warmly but not every message.`);
  }

  if (ctx.user.vision) {
    parts.push(`## Their Vision
They described the life they want to build as: "${ctx.user.vision}"
Hold them to this. Reference it when they're drifting.`);
  }

  parts.push(MENTOR_EXECUTION_PERSONA);

  if (ctx.rhythmBlock) {
    parts.push(`## Time context (adapt tone and urgency)\n${ctx.rhythmBlock}`);
  }

  if (ctx.todayPlanBlock) {
    parts.push(`## Today's plan (authoritative — reference when coaching execution)\n${ctx.todayPlanBlock}`);
  }

  // ===== CHAT MODE (coaching / goal-aware teaching / general) =====
  const chatMode = detectChatMode(ctx);
  parts.push(buildChatModeGuidance(chatMode));

  parts.push(MENTOR_EXPERIENCE_RULE);

  const wisdomBlock = buildWisdomGuidance(ctx.input.message, ctx.intent, ctx.userModel);
  if (wisdomBlock) parts.push(wisdomBlock);

  // Conversation state — this determines WHAT to do
  parts.push(`## Your Current Mode\n${getStateInstructions(ctx.state)}`);

  // ===== OBSERVATION MODE (when appropriate) =====
  if (shouldTriggerObservationMode(ctx)) {
    parts.push(buildObservationModeGuidance(ctx));
  }

  // ===== EMOTIONAL REGULATION LAYER =====
  const regulationPrompt = buildRegulationPrompt(
    ctx.emotion,
    ctx.state,
    ctx.input.message
  );
  parts.push(regulationPrompt);

  const emotionalState = detectEmotionalState(ctx.emotion, ctx.input.message);
  parts.push(`## Emotional State: ${emotionalState}
Remember: your response should create an emotional SHIFT. The user should feel DIFFERENT — clearer, more grounded, more accountable, or more at peace — after reading your response.`);

  // ===== USER MODEL (single source of truth — overrides fragmented table reads) =====
  if (ctx.memoryRetrievalBlock) {
    parts.push(ctx.memoryRetrievalBlock);
  }

  if (ctx.userModel) {
    parts.push(formatUserModelCompactForPrompt(ctx.userModel));
    const challenges = detectCoachingChallenges(ctx.userModel);
    const challengeBlock = formatChallengesForPrompt(challenges);
    if (challengeBlock) parts.push(challengeBlock);
    if (/who am i|what am i building|what do you know about me/i.test(ctx.input.message)) {
      parts.push(`## Direct answer for "Who am I?" (retention test — must feel like someone who's been listening)
Use whoAmIAnswer below. This should make them think "that's actually me" — not "that's a profile summary."
Every sentence MUST cite evidence (goals, chat, patterns, tasks, reflections). No personality adjectives without proof.
FORBIDDEN: ambitious, gritty, disciplined, intense, determined, resilient, "you seek growth", generic self-help.
PREFERRED: "Over the last month you've repeatedly..." / "You've told me..." / "The pattern that keeps showing up is..."

${ctx.userModel.whoAmIAnswer}

Evidence:
${ctx.userModel.evidence.map((e) => `- ${e}`).join("\n") || "- none yet"}`);
    }
    if (isWhyBelieveQuestion(ctx.input.message)) {
      parts.push(`Because: cite specific stored facts (goal titles, initiative names, task counts).
Acknowledge gaps: "It's still too early to tell whether..."
${buildEvidenceExplanation(ctx.userModel, ctx.input.message)}`);
    }
  }

  // ===== COGNITIVE STATE (Full Context Injection) =====
  const statePrompt = formatCognitiveStateForPrompt(ctx.cognitiveState);
  parts.push(statePrompt);

  // Emotional context — drives tone
  if (ctx.emotion) {
    let emotionBlock = `## What They're Feeling Right Now`;
    emotionBlock += `\nPrimary: ${ctx.emotion.primaryEmotion} (intensity: ${ctx.emotion.intensity}/10)`;
    
    if (ctx.emotion.secondaryEmotions.length > 0) {
      emotionBlock += `\nAlso present: ${ctx.emotion.secondaryEmotions.join(", ")}`;
    }

    if (ctx.emotion.needsSupport) {
      emotionBlock += `\nThis person needs grounding right now — not just empathy.`;
    }

    parts.push(emotionBlock);
  }

  // Memory context — emotional and factual continuity
  if (ctx.memory.formatted) {
    parts.push(`## What You Remember About Them (from past conversations)
${ctx.memory.formatted}

Reference these naturally when relevant. Weave them into understanding what's happening now. This is what creates the feeling of being known across time.`);
  }

  // Safety context
  if (ctx.safety.level === "caution" || ctx.safety.level === "warning") {
    parts.push(`## Safety Alert
This person may be in distress. Be extra gentle and present. If you sense escalation, ask directly: "Are you safe right now?" Don't wait.`);
  }

  // Response length guidance
  parts.push(getResponseLengthGuidance(ctx.state, ctx.emotion));

  // Anti-repetition (check last 3 AI responses)
  const recentAiResponses = ctx.conversationHistory
    .filter((m) => m.role === "assistant")
    .slice(-3)
    .map((m) => m.content);
  const antiRepetition = getAntiRepetitionInstructions(recentAiResponses);
  if (antiRepetition) {
    parts.push(antiRepetition);
  }

  // Conversation depth awareness
  const msgCount = ctx.conversationHistory.length;
  if (msgCount > 10) {
    parts.push(`## Conversation Depth
This is message ${msgCount}+ in the conversation. You have enough context to notice patterns, connect dots, and go deeper. Don't start fresh. Build on what's been discussed.`);
  }

  messages.push({ role: "system", content: parts.join("\n\n") });

  // === Add conversation history (last 20 messages) ===
  const history = ctx.conversationHistory.slice(-20);
  for (const msg of history) {
    messages.push({ role: msg.role, content: msg.content });
  }

  // === Confidence improvement flow injection ===
  if (ctx.input.confidenceGoalId) {
    const confidenceNote = buildConfidenceFlowNote(ctx.input.confidenceGoalId);
    // Insert as a system note right before the user message
    messages.push({ role: "system", content: confidenceNote });
  }

  // === Add current user message ===
  messages.push({ role: "user", content: ctx.input.message });

  const promptChars = messages.reduce((sum, m) => sum + m.content.length, 0);
  const estTokens = Math.ceil(promptChars / 4);
  if (process.env.NODE_ENV === "development" || estTokens > 3000) {
    console.log(
      `[Coach prompt] ~${estTokens} tokens (${promptChars} chars)${estTokens > 3000 ? " — TRIM CONTEXT" : ""}`
    );
  }

  return messages;
}

/**
 * System note injected when the confidence improvement flow is active.
 * Tells the coach to ask structured questions to improve plan precision.
 */
export function buildConfidenceFlowNote(goalId: string): string {
  return `## CONFIDENCE IMPROVEMENT FLOW (active — goalId: ${goalId})

The user wants to improve their plan precision for this goal. Your job: ask ONE question at a time to collect the 5 missing factors below. After each answer, acknowledge what it unlocks ("Got it — that's the deadline. Your tasks just became 3x more specific.") then ask the next question.

QUESTION SEQUENCE (ask in this order, skip already-answered ones):
1. DEADLINE: "By when do you need this done? Give me a specific date or month — even a rough one is fine."
2. RESOURCES: "How many hours per week can you actually put into this? Be honest — not the ideal, the real number."
3. SUCCESS METRIC: "What's the one number or outcome that would prove to you this worked? Money, clients, weight — be specific."
4. REAL OBSTACLE: "What's the most likely reason you'd fail at this? Not the generic answer — the real one."

After all questions answered, say: "Precision is now at [X]%. Your tasks tomorrow will be significantly more specific. Check your plan in the morning." Then stop asking questions.

RULES:
- One question per message only.
- Never ask two questions at once.
- Name what each answer unlocks: "A specific date means MenAI can count backwards and tell you exactly what to do each day."
- If the goal sounds vague (e.g. "financial freedom"), provide realistic context: typical timeline, intermediate milestone, then ask the user to confirm or adjust.`;
}
