/**
 * Prompt Builder — Dynamic context-aware prompt construction
 * Builds the system prompt with all context from the pipeline
 */

import type { PipelineContext } from "./types";
import { getStateInstructions } from "./state-machine";
import { SYSTEM_PROMPT } from "@/lib/ai/prompts";

/**
 * Build the complete prompt messages array for the LLM
 */
export function buildPrompt(
  ctx: PipelineContext
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];

  // === Build dynamic system prompt ===
  let systemContent = SYSTEM_PROMPT;

  // User personalization
  if (ctx.user.fullName) {
    systemContent += `\n\n## About This Person\nName: ${ctx.user.fullName}. Use it warmly but not every message.`;
  }

  if (ctx.user.therapyGoals && ctx.user.therapyGoals.length > 0) {
    systemContent += `\nTheir therapy goals: ${ctx.user.therapyGoals.join(", ")}.`;
  }

  // Conversation state instructions
  systemContent += `\n\n## Current Mode\n${getStateInstructions(ctx.state)}`;

  // Emotional context
  if (ctx.emotion) {
    systemContent += `\n\n## Their Current Emotional State`;
    systemContent += `\nPrimary emotion: ${ctx.emotion.primaryEmotion} (intensity: ${ctx.emotion.intensity}/10)`;
    if (ctx.emotion.secondaryEmotions.length > 0) {
      systemContent += `\nAlso feeling: ${ctx.emotion.secondaryEmotions.join(", ")}`;
    }
    systemContent += `\nSentiment: ${ctx.emotion.sentiment}`;
    if (ctx.emotion.needsSupport) {
      systemContent += `\n⚠️ This person needs emotional support right now. Lead with empathy.`;
    }
  }

  // Memory context
  if (ctx.memory.formatted) {
    systemContent += `\n\n## What You Remember About Them\n${ctx.memory.formatted}\nUse this naturally — don't force references.`;
  }

  // Safety context
  if (ctx.safety.level === "caution" || ctx.safety.level === "warning") {
    systemContent += `\n\n## Safety Note\nThis person may be in distress. Be extra gentle. If appropriate, gently mention that professional support is available.`;
  }

  messages.push({ role: "system", content: systemContent });

  // === Add conversation history (last 20 messages) ===
  const history = ctx.conversationHistory.slice(-20);
  for (const msg of history) {
    messages.push({ role: msg.role, content: msg.content });
  }

  // === Add current user message ===
  messages.push({ role: "user", content: ctx.input.message });

  return messages;
}
