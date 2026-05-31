import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { IdentityDimensionId } from "@/lib/user-model/identity-dimensions";
import {
  applyInterviewAnswer,
  buildDimensionInput,
  getFastInterviewResponse,
  getPlanContextState,
  markInterviewSkipped,
} from "@/lib/plans/plan-interview";
import { improvementHints } from "@/lib/plans/plan-context-dimensions";
import { invalidateTodayPlan } from "@/lib/plans/daily-plan-generator";
import { prefetchAiInterviewQuestion } from "@/lib/plans/interview-fast-path";

export const runtime = "nodejs";

function defer(fn: () => void | Promise<void>): void {
  void Promise.resolve().then(fn).catch((err) => {
    console.error("[Interview] background:", err);
  });
}

export async function POST(request: NextRequest) {
  const started = Date.now();
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
      defer(() => invalidateTodayPlan(supabase, user.id));
      const input = await buildDimensionInput(supabase, user.id);
      const { snapshot, goalAnalysis } = await getPlanContextState(supabase, user.id);
      return NextResponse.json({
        done: true,
        regenerated: true,
        goalAnalysis,
        snapshot: {
          planningQuality: snapshot.planningQuality,
          shouldInterview: false,
          improvementHints: improvementHints(input),
          dimensions: snapshot.dimensions.map((d) => ({
            id: d.id,
            label: d.label,
            satisfied: d.satisfied,
          })),
        },
        timings: { totalMs: Date.now() - started },
      });
    }

    if (!variableId || typeof variableId !== "string") {
      return NextResponse.json({ error: "Invalid variable" }, { status: 400 });
    }

    const saveStarted = Date.now();

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
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const saveMs = Date.now() - saveStarted;

    defer(() => invalidateTodayPlan(supabase, user.id));
    prefetchAiInterviewQuestion(supabase, user.id);

    const nextStarted = Date.now();
    const fast = await getFastInterviewResponse(
      supabase,
      user.id,
      action === "answer" ? (dimension as IdentityDimensionId | undefined) : undefined
    );
    const nextMs = Date.now() - nextStarted;

    return NextResponse.json({
      done: fast.done,
      regenerated: action === "answer",
      biggestUnknown: fast.biggestUnknown,
      stopReason: fast.stopReason,
      identityCoverage: fast.identityCoverage,
      overallCoverage: fast.overallCoverage,
      snapshot: {
        shouldInterview: fast.shouldInterview,
      },
      nextQuestion: fast.nextQuestion,
      timings: {
        saveMs,
        nextMs,
        totalMs: Date.now() - started,
      },
    });
  } catch (error) {
    console.error("Plan interview error:", error);
    return NextResponse.json({ error: "Interview failed" }, { status: 500 });
  }
}
