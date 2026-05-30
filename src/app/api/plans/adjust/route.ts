import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { adjustMiddayPlan } from "@/lib/plans/daily-plan-generator";

export const runtime = "nodejs";
export const maxDuration = 45;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const completedTitles = (body.completedTitles as string[]) || [];

    const result = await adjustMiddayPlan(supabase, user.id, completedTitles);

    return NextResponse.json({
      success: true,
      plan: result.plan,
      planId: result.planId,
    });
  } catch (error) {
    console.error("Midday adjust error:", error);
    return NextResponse.json({ error: "Failed to adjust plan" }, { status: 500 });
  }
}
