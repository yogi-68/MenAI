import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { IdentityDimensionId } from "@/lib/user-model/identity-dimensions";
import {
  applyInterviewAnswer,
  buildDimensionInput,
  getPlanContextState,
  markInterviewSkipped,
} from "@/lib/plans/plan-interview";
import { improvementHints } from "@/lib/plans/plan-context-dimensions";
import { invalidateTodayPlan } from "@/lib/plans/daily-plan-generator";

export const runtime = "nodejs";

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
    const variableId = typeof body.variableId === "string" ? body.variableId : body.dimension;
    const dimension = typeof body.dimension === "string" ? body.dimension : undefined;
    const answer = typeof body.answer === "string" ? body.answer.trim() : "";

    if (action === "generate_now") {
      await invalidateTodayPlan(supabase, user.id);
      const input = await buildDimensionInput(supabase, user.id);
      const { snapshot, goalAnalysis } = await getPlanContextState(supabase, user.id);
      return NextResponse.json({
        done: true,
        regenerated: true,
        goalAnalysis,
        snapshot: {
          planningQuality: snapshot.planningQuality,
          improvementHints: improvementHints(input),
          dimensions: snapshot.dimensions.map((d) => ({
            id: d.id,
            label: d.label,
            satisfied: d.satisfied,
          })),
        },
      });
    }

    if (!variableId || typeof variableId !== "string") {
      return NextResponse.json({ error: "Invalid variable" }, { status: 400 });
    }

    if (action === "skip") {
      await markInterviewSkipped(supabase, user.id, variableId);
    } else if (action === "answer") {
      if (!answer) {
        return NextResponse.json({ error: "Answer required" }, { status: 400 });
      }
      await applyInterviewAnswer(
        supabase,
        user.id,
        variableId,
        answer,
        dimension as IdentityDimensionId | undefined
      );
      await invalidateTodayPlan(supabase, user.id);
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const input = await buildDimensionInput(supabase, user.id);
    const { snapshot, goalAnalysis, nextQuestion, biggestUnknown, stopReason } =
      await getPlanContextState(supabase, user.id);
    const done = !snapshot.shouldInterview || !nextQuestion;

    return NextResponse.json({
      done,
      regenerated: action === "answer",
      goalAnalysis,
      biggestUnknown: done ? null : biggestUnknown,
      stopReason,
      snapshot: {
        planningQuality: snapshot.planningQuality,
        shouldInterview: snapshot.shouldInterview,
        improvementHints: improvementHints(input),
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
