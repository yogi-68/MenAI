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

  // ===== CONTEXT AWARENESS (prevents hallucination) =====
  if (ctx.contextRichness.level === "LOW") {
    parts.push(`## ⚠ CONTEXT AWARENESS: LOW
You do NOT have enough structured context about this person's goals, tasks, or commitments yet.

CRITICAL RULES:
- DO NOT invent goals, tasks, or plans for them
- DO NOT generate schedules with tasks like "Deep Work on MVP" or "Outreach Emails" unless THEY specifically mentioned those
- DO NOT assume they are a founder, student, or any specific role unless they told you
- Instead: ask what they're working on, what matters to them, what they want to move forward
- Your job right now is to LEARN about them, not to output plans

If they ask you to plan their day, respond with:
"I'd love to help structure your day — but first, what are the main things you're trying to move forward right now?"

This is how trust is built — by asking before assuming.`);
  } else if (ctx.contextRichness.level === "HIGH") {
    parts.push(`## CONTEXT AWARENESS: HIGH
You have rich context about this person's life — goals, tasks, commitments, relationships.
USE IT. Reference specific goals, follow up on commitments, and make plans grounded in THEIR actual priorities.
This is what makes you different from a generic chatbot.`);
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
