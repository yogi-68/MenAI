import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildDimensionInput, getPlanContextState } from "@/lib/plans/plan-interview";
import { improvementHints } from "@/lib/plans/plan-context-dimensions";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const input = await buildDimensionInput(supabase, user.id);
    const { snapshot, goalAnalysis, nextQuestion, biggestUnknown, stopReason, planningGaps } =
      await getPlanContextState(supabase, user.id);

    return NextResponse.json({
      snapshot: {
        dimensions: snapshot.dimensions.map((d) => ({
          id: d.id,
          label: d.label,
          satisfied: d.satisfied,
          gapHint: d.gapHint,
        })),
        planningQuality: snapshot.planningQuality,
        shouldInterview: snapshot.shouldInterview,
        improvementHints: improvementHints(input),
      },
      goalAnalysis,
      nextQuestion,
      biggestUnknown,
      stopReason,
      planningGaps,
    });
  } catch (error) {
    console.error("Plan context error:", error);
    return NextResponse.json({ error: "Failed to load plan context" }, { status: 500 });
  }
}
