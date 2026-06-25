import {
  MAX_ACTIVE_GOALS,
  MEMORY_CONFIDENCE,
} from "@/lib/product/constants";
import { trackProductEvent } from "@/lib/analytics/track-event";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function countActiveGoals(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { count } = await supabase
    .from("goals")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("goal_kind", "execution")
    .eq("status", "active");
  return count ?? 0;
}

export async function assertCanActivateGoal(
  supabase: SupabaseClient,
  userId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const n = await countActiveGoals(supabase, userId);
  if (n >= MAX_ACTIVE_GOALS) {
    return {
      ok: false,
      error: `You can have at most ${MAX_ACTIVE_GOALS} active goals. Pause one before adding another.`,
    };
  }
  return { ok: true };
}

export function shouldSaveExplicit(confidence: number): boolean {
  return confidence >= MEMORY_CONFIDENCE.explicitSave;
}

export async function queueSuggestion(
  supabase: SupabaseClient,
  opts: {
    userId: string;
    type: "initiative" | "opportunity" | "direction";
    title: string;
    payload: Record<string, unknown>;
    confidence: number;
    conversationId?: string;
  }
): Promise<void> {
  const title = opts.title.trim();
  if (!title) return;

  const { data: existing } = await supabase
    .from("ai_suggestions")
    .select("id")
    .eq("user_id", opts.userId)
    .eq("status", "pending")
    .ilike("title", title)
    .limit(1);

  if (existing?.length) return;

  await supabase.from("ai_suggestions").insert({
    user_id: opts.userId,
    suggestion_type: opts.type,
    title,
    payload: opts.payload,
    confidence: opts.confidence,
    status: "pending",
    source_conversation_id: opts.conversationId || null,
  });

  trackProductEvent(opts.userId, "suggestion_shown", {
    type: opts.type,
    title,
    confidence: opts.confidence,
  }).catch(() => {});
}

/** Archive prior active identity signals when direction shifts. */
export async function archivePriorIdentitySignals(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  await supabase
    .from("identity_signals")
    .update({ status: "archived" })
    .eq("user_id", userId)
    .eq("status", "active");
}
