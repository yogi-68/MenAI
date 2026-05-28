import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ensureUserSetup } from "@/lib/auth/ensure-user-setup";

export const runtime = "nodejs";

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await ensureUserSetup(user);

    return NextResponse.json({
      success: true,
      onboardingCompleted: result.onboardingCompleted,
      profileCreated: result.profileCreated,
      onboardingReset: result.onboardingReset,
      redirectTo: result.onboardingCompleted ? "/dashboard" : "/onboarding",
    });
  } catch (error) {
    console.error("Auth bootstrap error:", error);
    return NextResponse.json({ error: "Bootstrap failed" }, { status: 500 });
  }
}
