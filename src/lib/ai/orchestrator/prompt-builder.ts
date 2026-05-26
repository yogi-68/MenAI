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

/**
 * Build context confidence alert based on what we know about the user
 * This is critical for preventing hallucinated plans and fake personalization
 */
function buildContextConfidenceAlert(ctx: PipelineContext): string {
  const { contextRichness, lifeContext } = ctx;
  
  if (contextRichness.level === "LOW") {
    const goalsCount = lifeContext?.activeGoals?.length || 0;
    const tasksCount = lifeContext?.pendingTasks?.length || 0;
    const commitmentsCount = lifeContext?.activeCommitments?.length || 0;
    
    const missingInfo: string[] = [];
    if (!contextRichness.hasGoals) missingInfo.push("goals");
    if (!contextRichness.hasCommitments) missingInfo.push("commitments");
    if (!contextRichness.hasTasks) missingInfo.push("tasks");
    
    return `## ⚠️ CONTEXT CONFIDENCE: LOW

CRITICAL SITUATION: You have INSUFFICIENT context about this user.

What you know:
- ${goalsCount} goal(s)
- ${tasksCount} task(s)
- ${commitmentsCount} commitment(s)

Missing: ${missingInfo.join(", ")}

STRICT RULES — NEVER VIOLATE:
1. DO NOT invent goals, routines, projects, or plans
2. DO NOT assume they're a founder/student/entrepreneur unless they said so
3. DO NOT generate schedules with made-up tasks like:
   - "Work on your SaaS MVP"
   - "Send outreach emails"
   - "Deep work on landing page"
   - "Morning workout routine"
4. DO NOT create detailed plans without knowing their priorities

WHAT TO DO INSTEAD:
- Ask strategic clarification questions
- Example: "What are the main things you're trying to move forward right now?"
- Example: "What matters most to you currently?"
- Gather context naturally through conversation
- Extract information progressively

If they ask "Plan my day":
DO NOT respond with: "Here's your plan: 1. Work on MVP 2. Send emails..."
DO respond with: "I can help structure your day well, but I want to make sure it actually fits your priorities. What are the main things you're trying to move forward right now?"

Trust is built by ASKING, not ASSUMING.
This is the MOST IMPORTANT RULE in the entire system.`;
  }
  
  if (contextRichness.level === "MODERATE") {
    const goalsCount = lifeContext?.activeGoals?.length || 0;
    const tasksCount = lifeContext?.pendingTasks?.length || 0;
    const commitmentsCount = lifeContext?.activeCommitments?.length || 0;
    
    return `## ⚠️ CONTEXT CONFIDENCE: MODERATE

You have SOME context about this user, but not comprehensive understanding.

What you know:
- ${goalsCount} goal(s)
- ${tasksCount} task(s)  
- ${commitmentsCount} commitment(s)

RULES FOR MODERATE CONTEXT:
1. You CAN reference the specific goals/tasks/commitments you know about
2. You MUST verify assumptions before giving detailed advice
3. If they ask for plans, use ONLY their known goals/tasks
4. If they mention something new, confirm before treating it as established
5. Ask clarifying questions when you need more detail

Example:
- User: "Plan my day"
- Good response: "Based on your goal to [specific known goal], here's what would make sense: [tasks from their actual task list]. Is there anything else you need to prioritize today?"

You have enough to be useful, but be careful not to overextend beyond what you actually know.`;
  }
  
  if (contextRichness.level === "HIGH") {
    const goalsCount = lifeContext?.activeGoals?.length || 0;
    const tasksCount = lifeContext?.pendingTasks?.length || 0;
    const commitmentsCount = lifeContext?.activeCommitments?.length || 0;
    const momentum = lifeContext?.momentumScore || 50;
    
    return `## ✅ CONTEXT CONFIDENCE: HIGH

You have RICH context about this user's life.

What you know:
- ${goalsCount} active goal(s)
- ${tasksCount} pending task(s)
- ${commitmentsCount} active commitment(s)
- Momentum score: ${momentum}/100

YOUR ADVANTAGE:
- You can provide deeply personalized guidance
- Reference specific goals and commitments naturally
- Follow up on accountability items
- Generate plans grounded in THEIR actual priorities
- Detect patterns in their behavior over time

USE THIS CONTEXT:
- Don't just acknowledge their goals — weave them into your responses
- Call out when they're avoiding commitments
- Connect current challenges to past patterns
- Make strategic recommendations based on their trajectory

This is what makes you different from a generic chatbot.
This is when you deliver the most value — be strategic, be personal, be accountable.`;
  }
  
  return "";
}

/**
 * Validate if we have sufficient context for planning/scheduling requests
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
  const planningKeywords = [
    "plan my day",
    "plan my week", 
    "schedule",
    "what should i do today",
    "help me prioritize",
    "daily plan",
    "weekly plan"
  ];
  
  const isPlanningRequest = planningKeywords.some(keyword => 
    userMessage.toLowerCase().includes(keyword)
  );
  
  if (!isPlanningRequest) {
    return { sufficient: true, missingInfo: [], shouldAsk: false };
  }
  
  const missingInfo: string[] = [];
  const hasGoals = (lifeContext?.activeGoals?.length || 0) > 0;
  const hasTasks = (lifeContext?.pendingTasks?.length || 0) > 0;
  const hasCommitments = (lifeContext?.activeCommitments?.length || 0) > 0;
  
  if (!hasGoals) missingInfo.push("goals");
  if (!hasCommitments) missingInfo.push("commitments");
  
  const sufficient = hasGoals && (hasTasks || hasCommitments);
  const shouldAsk = !sufficient;
  
  const suggestedQuestions = shouldAsk ? [
    "What are the main things you're trying to move forward right now?",
    "What matters most to you currently?",
    "What do you want to accomplish in the next few weeks?"
  ] : undefined;
  
  return {
    sufficient,
    missingInfo,
    shouldAsk,
    suggestedQuestions
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
