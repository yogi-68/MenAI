/**
 * Prompt Builder — Dynamic context-aware prompt construction
 * Injects emotional state, memory, mood trends, and conversational state
 * into the system prompt to create deeply personalized responses
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
  const parts: string[] = [SYSTEM_PROMPT];

  // User personalization
  if (ctx.user.fullName) {
    parts.push(`## About This Person
Their name is ${ctx.user.fullName}. Use it warmly but not every message.`);
  }

  if (ctx.user.therapyGoals && ctx.user.therapyGoals.length > 0) {
    parts.push(`They're working on: ${ctx.user.therapyGoals.join(", ")}.`);
  }

  // Conversation state — this fundamentally changes response style
  parts.push(`## Your Current Mode\n${getStateInstructions(ctx.state)}`);

  // Emotional context — drives tone and depth
  if (ctx.emotion) {
    let emotionBlock = `## What They're Feeling Right Now`;
    emotionBlock += `\nPrimary: ${ctx.emotion.primaryEmotion} (intensity: ${ctx.emotion.intensity}/10)`;
    
    if (ctx.emotion.secondaryEmotions.length > 0) {
      emotionBlock += `\nAlso present: ${ctx.emotion.secondaryEmotions.join(", ")}`;
    }

    // Tone adaptation based on intensity
    if (ctx.emotion.intensity >= 8) {
      emotionBlock += `\n\n⚠️ VERY HIGH emotional intensity. Keep your response SHORT. Lead with empathy. No advice. No questions unless absolutely necessary. Be an anchor.`;
    } else if (ctx.emotion.intensity >= 6) {
      emotionBlock += `\n\nHigh emotional intensity. Lead with warmth. Validate before anything else. Keep it brief and grounded.`;
    }

    if (ctx.emotion.needsSupport) {
      emotionBlock += `\nThis person needs support right now. Show up for them.`;
    }

    parts.push(emotionBlock);
  }

  // Memory context — emotional continuity
  if (ctx.memory.formatted) {
    parts.push(`## What You Remember About Them
${ctx.memory.formatted}

Use this to show emotional continuity. Connect dots between past and present feelings. But keep it natural — don't recite facts.`);
  }

  // Safety context
  if (ctx.safety.level === "caution" || ctx.safety.level === "warning") {
    parts.push(`## Safety Alert
This person may be in distress. Be extra gentle and present. If you sense escalation, ask directly: "Are you safe right now?" Don't wait.`);
  }

  // Conversation length awareness
  const msgCount = ctx.conversationHistory.length;
  if (msgCount > 10) {
    parts.push(`## Conversation Depth
This is message ${msgCount}+ in the conversation. You should have enough context to notice patterns, connect dots, and reference earlier parts of this conversation. Don't start fresh each message.`);
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
