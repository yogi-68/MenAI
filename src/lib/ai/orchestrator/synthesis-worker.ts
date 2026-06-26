/**
 * Synthesis Worker — Deep Path Background Processing
 *
 * This runs OUTSIDE the request path. It is triggered by:
 *   - Vercel Cron (nightly at 2 AM)
 *   - Onboarding completion
 *   - Major life change detection
 *   - Manual rebuild via API
 *
 * What it does:
 *   1. Rebuilds full CognitiveState from all DB signals
 *   2. Persists to profiles.cognitive_state (JSONB)
 *   3. Updates Redis cache
 *   4. Generates task adaptations if needed
 *
 * IMPORTANT: This uses the SAME buildCognitiveState() as the fast path,
 * but additionally persists the result to the DB for durability.
 */

import { createServiceRoleClient } from "@/lib/supabase/server";
import { refreshUserModel } from "@/lib/user-model/loader";
import { rebuildAndPersistCognitiveState, type CognitiveState } from "./cognition-engine";

export interface SynthesisResult {
  userId: string;
  cognitiveState: CognitiveState;
  synthesizedAt: string;
  trigger: SynthesisTrigger;
}

export type SynthesisTrigger =
  | "nightly_cron"
  | "onboarding_complete"
  | "major_life_change"
  | "manual_rebuild"
  | "first_login_of_day";

/**
 * Run deep synthesis for a single user.
 * Called by cron jobs, onboarding completion, or manual triggers.
 */
export async function runDeepSynthesis(
  userId: string,
  trigger: SynthesisTrigger,
): Promise<SynthesisResult> {
  console.log(`[SynthesisWorker] Starting deep synthesis for ${userId} (trigger: ${trigger})`);

  const cognitiveState = await rebuildAndPersistCognitiveState(userId);

  const supabase = await createServiceRoleClient();
  await refreshUserModel(supabase, userId);

  console.log(`[SynthesisWorker] Completed for ${userId}:`, {
    maturity: cognitiveState.maturity_level,
    momentum: cognitiveState.momentum_state,
    weaknesses: cognitiveState.detected_weaknesses.length,
    dataPoints: cognitiveState.data_points,
  });

  return {
    userId,
    cognitiveState,
    synthesizedAt: new Date().toISOString(),
    trigger,
  };
}

/**
 * Run nightly synthesis for ALL active users.
 * Called by Vercel Cron at 2 AM.
 */
export async function runNightlySynthesis(): Promise<{
  processed: number;
  errors: number;
}> {
  const supabase = await createServiceRoleClient();

  // Get all users who had activity in the last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: activeUsers } = await supabase
    .from("profiles")
    .select("id")
    .eq("onboarding_completed", true)
    .gte("updated_at", sevenDaysAgo);

  if (!activeUsers || activeUsers.length === 0) {
    console.log("[SynthesisWorker] No active users to process");
    return { processed: 0, errors: 0 };
  }

  console.log(`[SynthesisWorker] Nightly synthesis starting for ${activeUsers.length} users`);

  let processed = 0;
  let errors = 0;

  // Process users sequentially to avoid overwhelming the DB
  for (const user of activeUsers) {
    try {
      await runDeepSynthesis(user.id, "nightly_cron");
      processed++;
    } catch (error) {
      console.error(`[SynthesisWorker] Failed for user ${user.id}:`, error);
      errors++;
    }
  }

  console.log(`[SynthesisWorker] Nightly synthesis complete: ${processed} processed, ${errors} errors`);
  return { processed, errors };
}

/**
 * Check if a user needs synthesis on login.
 * Returns true if their cognitive state is stale (> 12 hours old).
 */
export async function needsSynthesisOnLogin(userId: string): Promise<boolean> {
  const supabase = await createServiceRoleClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("cognitive_state")
    .eq("id", userId)
    .single();

  if (!profile?.cognitive_state) return true;

  const lastUpdated = (profile.cognitive_state as CognitiveState).last_updated;
  if (!lastUpdated) return true;

  const ageMs = Date.now() - new Date(lastUpdated).getTime();
  const twelveHours = 12 * 60 * 60 * 1000;

  return ageMs > twelveHours;
}
