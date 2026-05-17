/**
 * Prompt Builder — Dynamic context-aware prompt construction
 * 
 * Now includes the REGULATION ENGINE — the critical missing layer
 * that moves responses from "empathetic acknowledgement" to
 * "actual emotional state transformation."
 */

import type { PipelineContext } from "./types";
import { getStateInstructions } from "./state-machine";
import { SYSTEM_PROMPT } from "@/lib/ai/prompts";
import { getResponseLengthGuidance, getAntiRepetitionInstructions } from "./naturalizer";
import { buildRegulationPrompt, detectEmotionalState } from "./regulation-engine";

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

  if (ctx.user.therapyGoals && ctx.user.therapyGoals.length > 0) {
    parts.push(`They're working on: ${ctx.user.therapyGoals.join(", ")}.`);
  }

  // Conversation state — this determines WHAT to do
  parts.push(`## Your Current Mode\n${getStateInstructions(ctx.state)}`);

  // ===== THE CRITICAL LAYER: EMOTIONAL REGULATION =====
  // This determines HOW to do it — pacing, structure, nervous system calming
  const regulationPrompt = buildRegulationPrompt(
    ctx.emotion,
    ctx.state,
    ctx.input.message
  );
  parts.push(regulationPrompt);

  const emotionalState = detectEmotionalState(ctx.emotion, ctx.input.message);
  parts.push(`## Emotional State: ${emotionalState}
Remember: your response should create an emotional SHIFT. The user should feel DIFFERENT (calmer, more grounded, less alone, more contained) after reading your response — not just "heard."`);

  // Emotional context — drives tone
  if (ctx.emotion) {
    let emotionBlock = `## What They're Feeling Right Now`;
    emotionBlock += `\nPrimary: ${ctx.emotion.primaryEmotion} (intensity: ${ctx.emotion.intensity}/10)`;
    
    if (ctx.emotion.secondaryEmotions.length > 0) {
      emotionBlock += `\nAlso present: ${ctx.emotion.secondaryEmotions.join(", ")}`;
    }

    if (ctx.emotion.needsSupport) {
      emotionBlock += `\nThis person needs regulation right now — not just empathy.`;
    }

    parts.push(emotionBlock);
  }

  // Memory context — emotional continuity
  if (ctx.memory.formatted) {
    parts.push(`## What You Remember About Them
${ctx.memory.formatted}

This is what creates continuity — reference these naturally when relevant. Don't list them out robotically. Weave them into understanding what's happening now. That's what makes someone feel truly seen across time.`);
  }

  // Safety context
  if (ctx.safety.level === "caution" || ctx.safety.level === "warning") {
    parts.push(`## Safety Alert
This person may be in distress. Be extra gentle and present. If you sense escalation, ask directly: "Are you safe right now?" Don't wait.`);
  }

  // Response length guidance (from naturalizer)
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

  // Conversation length awareness
  const msgCount = ctx.conversationHistory.length;
  if (msgCount > 10) {
    parts.push(`## Conversation Depth
This is message ${msgCount}+ in the conversation. You have enough context to notice patterns, emotional arcs, and what's really going on underneath. Don't start fresh each message. Connect dots.`);
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
