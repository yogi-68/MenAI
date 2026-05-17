/**
 * LLM Router — Cost-Optimized Model Selection
 * Routes requests to cheap/standard/premium models based on context
 */

import { getOpenAI } from "@/lib/ai/openai";
import type { ModelConfig, ModelTier, EmotionAnalysis, SafetyResult, ConversationState } from "./types";

// Model configurations
const MODELS: Record<ModelTier, ModelConfig> = {
  cheap: {
    model: "gpt-4o-mini",
    maxTokens: 300,
    temperature: 0.7,
    tier: "cheap",
  },
  standard: {
    model: "gpt-4o-mini",
    maxTokens: 500,
    temperature: 0.8,
    tier: "standard",
  },
  premium: {
    model: "gpt-4o",
    maxTokens: 600,
    temperature: 0.8,
    tier: "premium",
  },
};

/**
 * Select the right model based on conversation context
 */
export function selectModel(params: {
  emotion: EmotionAnalysis;
  safety: SafetyResult;
  state: ConversationState;
  messageLength: number;
}): ModelConfig {
  const { emotion, safety, state } = params;

  // CRITICAL: Always use premium for crisis/safety situations
  if (safety.level === "critical" || safety.level === "danger") {
    return MODELS.premium;
  }

  // HIGH EMOTION: Use premium for deeply emotional conversations
  if (emotion.intensity >= 7 || emotion.needsSupport) {
    return MODELS.premium;
  }

  // REFRAMING/GOAL_SETTING: Needs nuanced responses
  if (state === "REFRAMING" || state === "GOAL_SETTING" || state === "ESCALATION") {
    return MODELS.premium;
  }

  // STANDARD: Normal conversations
  if (emotion.intensity >= 4 || state === "EXPLORING" || state === "VALIDATING") {
    return MODELS.standard;
  }

  // CHEAP: Casual greetings, simple questions, reflection
  return MODELS.cheap;
}

/**
 * Call the LLM with the selected model
 */
export async function callLLM(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  config: ModelConfig
): Promise<{
  content: string;
  tokensUsed: number;
  model: string;
}> {
  const openai = getOpenAI();

  const completion = await openai.chat.completions.create({
    model: config.model,
    messages,
    max_tokens: config.maxTokens,
    temperature: config.temperature,
    presence_penalty: 0.3,
    frequency_penalty: 0.3,
  });

  return {
    content: completion.choices[0]?.message?.content || "I'm here for you. Could you tell me more?",
    tokensUsed: completion.usage?.total_tokens || 0,
    model: config.model,
  };
}

/**
 * Call the LLM with streaming — returns a ReadableStream for progressive rendering
 */
export async function callLLMStreaming(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  config: ModelConfig
): Promise<{
  stream: ReadableStream<Uint8Array>;
  model: string;
}> {
  const openai = getOpenAI();

  const completion = await openai.chat.completions.create({
    model: config.model,
    messages,
    max_tokens: config.maxTokens,
    temperature: config.temperature,
    presence_penalty: 0.3,
    frequency_penalty: 0.3,
    stream: true,
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of completion) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            controller.enqueue(encoder.encode(delta));
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return { stream, model: config.model };
}

/**
 * Quick classification call (always uses cheapest model)
 */
export async function classifyWithLLM(
  systemPrompt: string,
  userContent: string
): Promise<string> {
  const openai = getOpenAI();

  const completion = await openai.chat.completions.create({
    model: MODELS.cheap.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    max_tokens: 150,
    temperature: 0.3,
  });

  return completion.choices[0]?.message?.content || "";
}
