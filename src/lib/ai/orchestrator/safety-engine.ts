/**
 * Safety Engine — Multi-Layer Moderation Pipeline
 * Layer 1: Rule-based keyword detection (instant)
 * Layer 2: OpenAI Moderation API
 * Layer 3: Emotional intensity assessment
 */

import { moderateContent } from "@/lib/ai/openai";
import { detectCrisis, getCrisisResponseMessage } from "@/lib/ai/crisis-detection";
import type { SafetyResult, EmotionAnalysis } from "./types";

/**
 * Full safety pipeline — runs all layers
 */
export async function runSafetyPipeline(
  message: string,
  emotion?: EmotionAnalysis
): Promise<SafetyResult> {
  // === LAYER 1: Rule-based detection (instant, ~1ms) ===
  const crisisResult = detectCrisis(message);

  if (crisisResult.requiresEscalation) {
    return {
      level: crisisResult.level === "critical" ? "critical" : "danger",
      categories: crisisResult.categories,
      confidence: crisisResult.confidence,
      requiresEscalation: true,
      moderationFlagged: false,
      crisisResponse: getCrisisResponseMessage(crisisResult),
      resources: crisisResult.emergencyResources,
    };
  }

  // === LAYER 2: OpenAI Moderation API ===
  let moderationFlagged = false;
  try {
    const modResult = await moderateContent(message);
    moderationFlagged = modResult.flagged;
  } catch (e) {
    console.error("Moderation API error:", e);
  }

  // === LAYER 3: Emotional intensity assessment ===
  let emotionalEscalation = false;
  if (emotion && emotion.intensity >= 8 && emotion.sentiment === "negative") {
    emotionalEscalation = true;
  }

  // Determine final safety level
  let level: SafetyResult["level"] = "safe";

  if (crisisResult.level === "medium") {
    level = "warning";
  } else if (moderationFlagged) {
    level = "caution";
  } else if (emotionalEscalation) {
    level = "caution";
  }

  return {
    level,
    categories: crisisResult.categories,
    confidence: crisisResult.confidence,
    requiresEscalation: false,
    moderationFlagged,
    crisisResponse: crisisResult.level === "medium" ? getCrisisResponseMessage(crisisResult) : undefined,
    resources: crisisResult.level !== "none" ? crisisResult.emergencyResources : [],
  };
}
