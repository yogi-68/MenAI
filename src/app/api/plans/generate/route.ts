/**
 * Daily Plan API — auto-generates today's execution plan once per day.
 * GET or POST: returns existing plan or generates a new one.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ensureTodayPlan } from "@/lib/plans/daily-plan-generator";

export const runtime = "nodejs";
export const maxDuration = 45;

async function handlePlanRequest() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await ensureTodayPlan(supabase, user.id);

  return NextResponse.json({
    success: true,
    plan: result.plan,
    planId: result.planId,
    created: result.created,
  });
}

export async function GET(_request: NextRequest) {
  try {
    return await handlePlanRequest();
  } catch (error) {
    console.error("Plan fetch/generate error:", error);
    return NextResponse.json(
      { error: "Failed to load today's plan" },
      { status: 500 }
    );
  }
}

export async function POST(_request: NextRequest) {
  try {
    return await handlePlanRequest();
  } catch (error) {
    console.error("Plan generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate plan" },
      { status: 500 }
    );
  }
}
