import type { User } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { trackProductEventOnce } from "@/lib/analytics/track-event";

/**
 * Ensures every authenticated user has a profile and onboarding_progress row.
 * Uses service role so it works even when profiles INSERT policies are missing.
 */
export async function ensureUserSetup(user: User): Promise<{
  profileCreated: boolean;
  onboardingReset: boolean;
  onboardingCompleted: boolean;
}> {
  const service = await createServiceRoleClient();

  const fullName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.user_metadata?.fullName ||
    "";
  const avatarUrl =
    user.user_metadata?.avatar_url || user.user_metadata?.picture || "";

  const { data: existingProfile } = await service
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  let profileCreated = false;
  let onboardingReset = false;

  if (!existingProfile) {
    const { error } = await service.from("profiles").upsert(
      {
        id: user.id,
        email: user.email,
        full_name: fullName,
        avatar_url: avatarUrl,
        onboarding_completed: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
    if (error) {
      console.error("ensureUserSetup profile error:", error);
    } else {
      profileCreated = true;
    }

    trackProductEventOnce(user.id, "signup").catch(() => {});

    // Profile was deleted — treat as fresh user, reset onboarding
    await service.from("onboarding_progress").upsert(
      {
        user_id: user.id,
        current_question_id: "Q1",
        completed_at: null,
        completed_questions: [],
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    onboardingReset = true;
  } else {
    const { data: progress } = await service
      .from("onboarding_progress")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!progress) {
      await service.from("onboarding_progress").insert({
        user_id: user.id,
        current_question_id: "Q1",
        completed_questions: [],
        started_at: new Date().toISOString(),
      });
    }
  }

  const { data: finalProgress } = await service
    .from("onboarding_progress")
    .select("completed_at")
    .eq("user_id", user.id)
    .maybeSingle();

  return {
    profileCreated,
    onboardingReset,
    onboardingCompleted: !!finalProgress?.completed_at,
  };
}
