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
import { formatLifeContextForPrompt } from "./accountability-engine";
import { formatSnapshotForPrompt, formatInferenceGuidance } from "./snapshot-engine";

/**
 * Build context confidence alert based on what we know about the user
 * This is critical for preventing hallucinated plans and fake personalization
 */
function buildContextConfidenceAlert(ctx: PipelineContext): string {
  const { contextRichness, lifeContext } = ctx;
  
  const goalsCount = lifeContext?.activeGoals?.length || 0;
  const tasksCount = lifeContext?.pendingTasks?.length || 0;
  const commitmentsCount = lifeContext?.activeCommitments?.length || 0;

  if (contextRichness.level === "LOW") {
    return `## CONTEXT CONFIDENCE: LOW — Use Soft Inference

You have LIMITED structured data about this user:
- ${goalsCount} goal(s), ${tasksCount} task(s), ${commitmentsCount} commitment(s)

YOUR BEHAVIOR:
1. Use EVERYTHING you have — conversation history, memories, and what they just said
2. If they ask for a plan, GENERATE one using whatever signals you have:
   - Their message content (what they're talking about IS their priority)
   - Memory context (past conversations reveal goals)
   - Their profile (founder mode, vision, coaching style)
3. Mark AI-inferred items as suggestions: "Based on what you've shared..."
4. Add 1 natural question that deepens understanding WITHOUT blocking action
5. NEVER say "I need to know your goals first" or "What are your priorities?"

INSTEAD OF: "What are your goals?"
SAY: "Based on what you've been working through, here's what I'd prioritize today: [inferred plan]. Adjust however you need."

The user chose an AI Life OS — not a form. Act like a mentor who pays attention, not a system that demands input.`;
  }
  
  if (contextRichness.level === "MODERATE") {
    return `## CONTEXT CONFIDENCE: MODERATE — Generate With Confidence

You have SOLID context about this user:
- ${goalsCount} active goal(s)
- ${tasksCount} pending task(s)
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
  
  if (contextRichness.level === "HIGH") {
    const momentum = lifeContext?.momentumScore || 50;
    
    return `## CONTEXT CONFIDENCE: HIGH — Full Strategic Intelligence

You have RICH context about this person's life:
- ${goalsCount} active goal(s), ${tasksCount} pending task(s), ${commitmentsCount} active commitment(s)
- Momentum: ${momentum}/100

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
 * Get inference guidance for planning — NEVER blocks, always suggests
 */
export function validateSufficientContext(
  lifeContext: PipelineContext["lifeContext"],
  userMessage: string
): {
  sufficient: boolean;
  missingInfo: string[];
  shouldAsk: boolean;
  suggestedQuestions?: string[];
} {
  const hasGoals = (lifeContext?.activeGoals?.length || 0) > 0;
  const hasTasks = (lifeContext?.pendingTasks?.length || 0) > 0;
  const hasCommitments = (lifeContext?.activeCommitments?.length || 0) > 0;
  
  const missingInfo: string[] = [];
  if (!hasGoals) missingInfo.push("goals");
  if (!hasCommitments) missingInfo.push("commitments");
  
  // Always sufficient — the AI should infer, not block
  // The context confidence alert handles how to behave at each level
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

  // Conversation state — this determines WHAT to do
  parts.push(`## Your Current Mode\n${getStateInstructions(ctx.state)}`);

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

  // ===== LIFE CONTEXT (Structured Data) =====
  if (ctx.lifeContext) {
    const lifeContextFormatted = formatLifeContextForPrompt(ctx.lifeContext);
    if (lifeContextFormatted) {
      parts.push(`## Their Life Context — What You Know
${lifeContextFormatted}

Use this naturally. Reference their goals and commitments when relevant. Follow up on accountability items at appropriate moments — not all at once. This is what makes you feel like a mentor who actually pays attention.`);
    }
  }

  // ===== CONTEXT CONFIDENCE SYSTEM (prevents hallucination) =====
  const contextDetails = buildContextConfidenceAlert(ctx);
  parts.push(contextDetails);

  // ===== LIFE SNAPSHOT (compact cached operating state) =====
  if (ctx.lifeSnapshot) {
    const snapshotText = formatSnapshotForPrompt(ctx.lifeSnapshot);
    if (snapshotText) {
      parts.push(snapshotText);
    }
  }

  // ===== INFERENCE CONFIDENCE GUIDE =====
  if (ctx.inferenceConfidence) {
    const inferenceText = formatInferenceGuidance(ctx.inferenceConfidence);
    if (inferenceText) {
      parts.push(inferenceText);
    }
  }

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
