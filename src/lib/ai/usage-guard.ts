import { createServiceRoleClient } from "@/lib/supabase/server";
import { estimateCostUsd } from "@/lib/ai/models";
import { logger } from "@/lib/observability/logger";

const DAILY_PLAN_LIMIT = Number(process.env.AI_DAILY_PLAN_LIMIT || 5);
const WEEKLY_REVIEW_LIMIT = Number(process.env.AI_WEEKLY_REVIEW_LIMIT || 3);
const CHAT_DAILY_LIMIT = Number(process.env.AI_CHAT_DAILY_LIMIT || 50);

export type AiFeature = "daily_plan" | "weekly_review" | "chat";

const LIMITS: Record<AiFeature, number> = {
  daily_plan: DAILY_PLAN_LIMIT,
  weekly_review: WEEKLY_REVIEW_LIMIT,
  chat: CHAT_DAILY_LIMIT,
};

/** User-safe message — never expose quotas or token counts. */
export const AI_UNAVAILABLE_MESSAGE =
  "We couldn't generate this right now. Please try again in a few minutes.";

/** Shown when the user has genuinely exhausted a daily allowance. */
export const AI_QUOTA_MESSAGE =
  "You've reached today's limit for this. It resets tomorrow.";

/**
 * Per-user daily quota.
 *
 * Fails OPEN on a database error: the quota is a spend control, and a cache or
 * database blip should not lock a paying-attention user out of their coach.
 * Abuse is bounded by the per-minute rate limiter, which sits in front of this.
 */
export async function checkAiQuota(
  userId: string,
  feature: AiFeature
): Promise<{ allowed: boolean; used: number; limit: number }> {
  const limit = LIMITS[feature];

  const since = new Date();
  since.setHours(0, 0, 0, 0);

  try {
    const db = await createServiceRoleClient();
    const { count, error } = await db
      .from("ai_usage_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("feature", feature)
      .gte("created_at", since.toISOString());

    if (error) throw error;

    const used = count ?? 0;
    return { allowed: used < limit, used, limit };
  } catch (error) {
    logger.error("[usage-guard] quota check failed — allowing request", error, {
      userId,
      feature,
    });
    return { allowed: true, used: 0, limit };
  }
}

export async function logAiUsage(
  userId: string,
  feature: string,
  model: string,
  tokensIn: number,
  tokensOut: number,
  opts?: {
    ttftMs?: number | null;
    durationMs?: number | null;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    const db = await createServiceRoleClient();
    await db.from("ai_usage_log").insert({
      user_id: userId,
      feature,
      model,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      // Priced per model rather than at a flat rate, so spend reporting
      // reflects which tier actually ran.
      cost_estimate: estimateCostUsd(model, tokensIn, tokensOut),
      ttft_ms: opts?.ttftMs ?? null,
      duration_ms: opts?.durationMs ?? null,
      metadata: opts?.metadata ?? {},
    });
  } catch (error) {
    // Usage logging must never break the feature it is measuring.
    logger.error("[usage-guard] usage log write failed", error, { userId, feature, model });
  }
}
