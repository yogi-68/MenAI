/**
 * Emotion Engine — Real-time emotional analysis and state tracking
 */

import { classifyWithLLM } from "./router";
import type { EmotionAnalysis } from "./types";

const EMOTION_SYSTEM_PROMPT = `Analyze the user's message and return ONLY a valid JSON object:
{
  "primaryEmotion": "joy|sadness|anger|fear|surprise|disgust|trust|anticipation|neutral",
  "intensity": <1-10>,
  "secondaryEmotions": ["emotion1", "emotion2"],
  "sentiment": "positive|negative|neutral",
  "needsSupport": <true|false>,
  "valence": <float -1 to 1>
}
Respond ONLY with JSON, no other text.`;

/**
 * Detect emotions from a message using cheap LLM
 */
export async function detectEmotion(message: string): Promise<EmotionAnalysis> {
  const defaultResult: EmotionAnalysis = {
    primaryEmotion: "neutral",
    intensity: 3,
    secondaryEmotions: [],
    sentiment: "neutral",
    needsSupport: false,
    valence: 0,
  };

  try {
    const raw = await classifyWithLLM(EMOTION_SYSTEM_PROMPT, message);
    const parsed = JSON.parse(raw);

    return {
      primaryEmotion: parsed.primaryEmotion || "neutral",
      intensity: Math.min(10, Math.max(1, parsed.intensity || 3)),
      secondaryEmotions: parsed.secondaryEmotions || [],
      sentiment: parsed.sentiment || "neutral",
      needsSupport: parsed.needsSupport || false,
      valence: Math.min(1, Math.max(-1, parsed.valence || 0)),
    };
  } catch {
    return defaultResult;
  }
}

/**
 * Quick emotion check without LLM (keyword-based, instant)
 */
export function quickEmotionCheck(message: string): {
  likelyNegative: boolean;
  likelyHighIntensity: boolean;
} {
  const lower = message.toLowerCase();
  const negativeKeywords = [
    "sad", "depressed", "anxious", "scared", "angry", "hopeless",
    "overwhelmed", "exhausted", "lonely", "worthless", "stressed",
    "panic", "crying", "can't sleep", "nightmare", "hate",
  ];
  const intensityKeywords = [
    "extremely", "very", "so much", "can't stop", "always",
    "never", "worst", "terrible", "unbearable", "dying",
  ];

  const likelyNegative = negativeKeywords.some((k) => lower.includes(k));
  const likelyHighIntensity = intensityKeywords.some((k) => lower.includes(k));

  return { likelyNegative, likelyHighIntensity };
}
