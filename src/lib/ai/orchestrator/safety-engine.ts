/**
 * Safety Engine — Multi-Layer Moderation Pipeline
 * Layer 1: Rule-based keyword detection (instant, sync)
 * Layer 2: OpenAI Moderation API (async — off streaming critical path)
 * Layer 3: Emotional intensity assessment (sync when emotion available)
 */

import { moderateContent } from "@/lib/ai/openai";
import { detectCrisis, getCrisisResponseMessage } from "@/lib/ai/crisis-detection";
import { logger } from "@/lib/observability/logger";
import type { SafetyResult, EmotionAnalysis } from "./types";

function buildSafetyFromCrisis(
  crisisResult: ReturnType<typeof detectCrisis>,
  moderationFlagged: boolean,
  emotionalEscalation: boolean
): SafetyResult {
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
    crisisResponse:
      crisisResult.level === "medium" ? getCrisisResponseMessage(crisisResult) : undefined,
    resources: crisisResult.level !== "none" ? crisisResult.emergencyResources : [],
  };
}

/** Sync crisis + emotional check — safe to run before first token. */
export function runCrisisSafetyCheck(
  message: string,
  emotion?: EmotionAnalysis
): SafetyResult {
  const crisisResult = detectCrisis(message);
  const emotionalEscalation =
    !!emotion && emotion.intensity >= 8 && emotion.sentiment === "negative";
  return buildSafetyFromCrisis(crisisResult, false, emotionalEscalation);
}

/**
 * OpenAI moderation — call off the hot path.
 *
 * Fails CLOSED. Returning `false` on an API error meant that an outage at the
 * provider silently disabled moderation entirely, which is precisely the
 * condition under which you most need it. Treating an error as "flagged" costs
 * a handful of false positives; treating it as "clean" costs the guarantee.
 */
export async function runModerationCheck(message: string): Promise<boolean> {
  try {
    const modResult = await moderateContent(message);
    return modResult.flagged;
  } catch (e) {
    logger.error("[safety] moderation unavailable — failing closed", e);
    return true;
  }
}

/** Fire-and-forget moderation after stream starts or response completes. */
export function scheduleAsyncModeration(
  message: string,
  onFlagged?: (flagged: boolean) => void
): void {
  void runModerationCheck(message).then((flagged) => {
    if (flagged) {
      logger.warn("[safety] post-hoc moderation flagged a user message");
    }
    onFlagged?.(flagged);
  });
}
