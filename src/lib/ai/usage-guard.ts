import { createServiceRoleClient } from "@/lib/supabase/server";

const DAILY_PLAN_LIMIT = Number(process.env.AI_DAILY_PLAN_LIMIT || 5);
const WEEKLY_REVIEW_LIMIT = Number(process.env.AI_WEEKLY_REVIEW_LIMIT || 3);

/** User-safe message — never expose quotas or token counts. */
export const AI_UNAVAILABLE_MESSAGE =
  "We couldn't generate this right now. Please try again in a few minutes.";

export async function checkAiQuota(
  userId: string,
  feature: "daily_plan" | "weekly_review" | "chat"
): Promise<{ allowed: boolean }> {
  const limit =
    feature === "daily_plan"
      ? DAILY_PLAN_LIMIT
      : feature === "weekly_review"
        ? WEEKLY_REVIEW_LIMIT
        : Number(process.env.AI_CHAT_DAILY_LIMIT || 50);

  const since = new Date();
  since.setHours(0, 0, 0, 0);

  const db = await createServiceRoleClient();
  const { count } = await db
    .from("ai_usage_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("feature", feature)
    .gte("created_at", since.toISOString());

  return { allowed: (count ?? 0) < limit };
}

export async function logAiUsage(
  userId: string,
  feature: string,
  model: string,
  tokensIn: number,
  tokensOut: number,
  opts?: { ttftMs?: number | null; durationMs?: number | null }
): Promise<void> {
  const db = await createServiceRoleClient();
  const costEstimate = ((tokensIn + tokensOut) / 1_000_000) * 0.15;
  await db.from("ai_usage_log").insert({
    user_id: userId,
    feature,
    model,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    cost_estimate: costEstimate,
    ttft_ms: opts?.ttftMs ?? null,
    duration_ms: opts?.durationMs ?? null,
  });
}
