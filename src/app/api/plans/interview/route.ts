import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  applyInterviewAnswer,
  getPlanContextState,
  markInterviewSkipped,
} from "@/lib/plans/plan-interview";
import { improvementHints } from "@/lib/plans/plan-context-dimensions";
import type { ContextDimensionId } from "@/lib/plans/plan-context-dimensions";
import { invalidateTodayPlan } from "@/lib/plans/daily-plan-generator";

export const runtime = "nodejs";

const VALID_DIMENSIONS = new Set<ContextDimensionId>([
  "goal_clarity",
  "initiative_clarity",
  "deadline_clarity",
  "obstacle_clarity",
  "available_time",
]);

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const action = body.action as "answer" | "skip" | "generate_now";
    const dimension = body.dimension as ContextDimensionId | undefined;
    const answer = typeof body.answer === "string" ? body.answer.trim() : "";

    if (action === "generate_now") {
      await invalidateTodayPlan(supabase, user.id);
      const { snapshot } = await getPlanContextState(supabase, user.id);
      return NextResponse.json({
        done: true,
        regenerated: true,
        snapshot: {
          planningQuality: snapshot.planningQuality,
          improvementHints: improvementHints(snapshot.dimensions),
          dimensions: snapshot.dimensions.map((d) => ({
            id: d.id,
            label: d.label,
            satisfied: d.satisfied,
          })),
        },
      });
    }

    if (!dimension || !VALID_DIMENSIONS.has(dimension)) {
      return NextResponse.json({ error: "Invalid dimension" }, { status: 400 });
    }

    if (action === "skip") {
      await markInterviewSkipped(supabase, user.id, dimension);
    } else if (action === "answer") {
      if (!answer) {
        return NextResponse.json({ error: "Answer required" }, { status: 400 });
      }
      await applyInterviewAnswer(supabase, user.id, dimension, answer);
      await invalidateTodayPlan(supabase, user.id);
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const { snapshot, nextQuestion } = await getPlanContextState(supabase, user.id);
    const done = !snapshot.shouldInterview || !nextQuestion;

    return NextResponse.json({
      done,
      regenerated: action === "answer",
      snapshot: {
        planningQuality: snapshot.planningQuality,
        shouldInterview: snapshot.shouldInterview,
        improvementHints: improvementHints(snapshot.dimensions),
        dimensions: snapshot.dimensions.map((d) => ({
          id: d.id,
          label: d.label,
          satisfied: d.satisfied,
          gapHint: d.gapHint,
        })),
      },
      nextQuestion: done ? null : nextQuestion,
    });
  } catch (error) {
    console.error("Plan interview error:", error);
    return NextResponse.json({ error: "Interview failed" }, { status: 500 });
  }
}
