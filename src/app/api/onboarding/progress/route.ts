/**
 * Onboarding Progress API
 * Get and update onboarding progress
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: progress } = await supabase
      .from("onboarding_progress")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!progress) {
      // Initialize progress
      const { data: newProgress } = await supabase
        .from("onboarding_progress")
        .insert({
          user_id: user.id,
          current_question_id: "Q1",
          completed_questions: [],
        })
        .select()
        .single();

      return NextResponse.json({
        progress: newProgress || {
          currentQuestionId: "Q1",
          completedQuestions: [],
        },
      });
    }

    return NextResponse.json({
      progress: {
        currentQuestionId: progress.current_question_id,
        completedQuestions: progress.completed_questions,
        completedAt: progress.completed_at,
      },
    });
  } catch (error) {
    console.error("Progress fetch error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { currentQuestionId, completed } = body;

    const updateData: any = {
      user_id: user.id,
      updated_at: new Date().toISOString(),
    };

    if (currentQuestionId) {
      updateData.current_question_id = currentQuestionId;
    }

    if (completed) {
      updateData.completed_at = new Date().toISOString();
      
      // Mark onboarding as completed in profile
      await supabase
        .from("profiles")
        .update({ onboarding_completed: true })
        .eq("id", user.id);
    }

    await supabase
      .from("onboarding_progress")
      .upsert(updateData);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Progress update error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
