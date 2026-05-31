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
import { getStateInstructions } from "./state-machine";
import { SYSTEM_PROMPT } from "@/lib/ai/prompts";
import { getResponseLengthGuidance, getAntiRepetitionInstructions } from "./naturalizer";
import { buildRegulationPrompt, detectEmotionalState } from "./regulation-engine";
import { formatCognitiveStateForPrompt } from "./cognition-engine";
import { formatUserModelForPrompt } from "@/lib/user-model/format-for-prompt";
import { buildChatModeGuidance, detectChatMode } from "@/lib/ai/orchestrator/chat-modes";
import {
  buildEvidenceExplanation,
  isWhyBelieveQuestion,
} from "@/lib/user-model/evidence-explanation";

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
function buildObservationModeGuidance(ctx: PipelineContext): string {
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
function buildContextConfidenceAlert(ctx: PipelineContext): string {
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
   - Their profile (founder mode, vision, coaching style)
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
 * Validate if we have sufficient context for the user's request
 * Now provides real validation instead of always returning true
 */
export function validateSufficientContext(
  cognitiveState: PipelineContext["cognitiveState"],
  userMessage: string
): {
  sufficient: boolean;
  missingInfo: string[];
  shouldAsk: boolean;
  suggestedQuestions?: string[];
} {
  const hasGoals = cognitiveState.active_goals.length > 0;
  const hasCommitments = cognitiveState.unfinished_commitments.length > 0;
  
  const missingInfo: string[] = [];
  if (!hasGoals) missingInfo.push("goals");
  if (!hasCommitments) missingInfo.push("commitments");
  
  // Always return sufficient — the context confidence system (LOW/MODERATE/HIGH) 
  // will guide how the AI behaves. The AI should NEVER refuse to engage.
  return {
    sufficient: true,
    missingInfo,
    shouldAsk: false,
  };
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

  if (ctx.user.founderMode) {
    parts.push(`## Founder Mode: ACTIVE
This person is building a startup/product. Think like a co-founder. Push execution. Challenge feature creep. Remind them to ship.`);
  }

  if (ctx.user.coachingStyle) {
    let styleText = "";
    switch (ctx.user.coachingStyle) {
      case "push":
        styleText = "Direct, high-pressure execution coaching. Call out procrastination, hold them strictly accountable, challenge excuses directly, and cut through avoidant talk. Do not baby them.";
        break;
      case "gentle":
        styleText = "Supportive, warm, and restorative guide. Focus on energy restoration, recovery, and pacing. Avoid aggressive pressure or guilt-inducing accountability. Emphasize sustainability.";
        break;
      case "strategic":
        styleText = "Executive systems consultant. Focus on strategic leverage, business metrics, product-market validation, delegation, and structured execution. Think like an advisor rather than a cheerleader.";
        break;
      case "balanced":
      default:
        styleText = "A balanced mix of supportive active listening and firm accountability push. Praise consistency, but call out patterns of stagnation when they arise.";
        break;
    }
    parts.push(`## Your Mentorship Style: ${ctx.user.coachingStyle.toUpperCase()}
Instructed behavior: ${styleText}`);
  }

  // ===== CHAT MODE (coaching / goal-aware teaching / general) =====
  const chatMode = detectChatMode(ctx);
  parts.push(buildChatModeGuidance(chatMode));

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
  if (ctx.userModel) {
    parts.push(formatUserModelForPrompt(ctx.userModel));
    if (/who am i|what am i building|what do you know about me/i.test(ctx.input.message)) {
      parts.push(`## Direct answer for "Who am I?"
Use whoAmIAnswer below. Coach voice — no "MenAI understands" phrasing.
Every claim must be verifiable from the evidence list.
FORBIDDEN without evidence: personality adjectives (ambitious, gritty, disciplined, intense, determined, resilient).

${ctx.userModel.whoAmIAnswer}

Evidence:
${ctx.userModel.evidence.map((e) => `- ${e}`).join("\n") || "- none yet"}`);
    }
    if (isWhyBelieveQuestion(ctx.input.message)) {
      parts.push(buildEvidenceExplanation(ctx.userModel, ctx.input.message));
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

  // === Add current user message ===
  messages.push({ role: "user", content: ctx.input.message });

  return messages;
}
