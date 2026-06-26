/**
 * Onboarding Answer API
 * Saves individual question responses and triggers memory extraction
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { extractOnboardingMemory } from "@/lib/ai/onboarding-extraction";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { questionId, response, responseData } = body;

    if (!questionId) {
      return NextResponse.json(
        { error: "Question ID required" },
        { status: 400 }
      );
    }

    // Save response
    const { data: savedResponse, error: saveError } = await supabase
      .from("onboarding_responses")
      .insert({
        user_id: user.id,
        question_id: questionId,
        response_text: response || null,
        response_data: responseData || null,
        processed: false,
      })
      .select()
      .single();

    if (saveError) {
      console.error("Error saving onboarding response:", saveError);
      return NextResponse.json(
        { error: "Failed to save response" },
        { status: 500 }
      );
    }

    // Update progress
    const { data: progress } = await supabase
      .from("onboarding_progress")
      .select("completed_questions")
      .eq("user_id", user.id)
      .single();

    const completedQuestions = progress?.completed_questions || [];
    if (!completedQuestions.includes(questionId)) {
      completedQuestions.push(questionId);
    }

    await supabase
      .from("onboarding_progress")
      .upsert({
        user_id: user.id,
        completed_questions: completedQuestions,
        updated_at: new Date().toISOString(),
      });

    // Extract memory asynchronously (non-blocking)
    extractOnboardingMemory(user.id, questionId, response, responseData, supabase)
      .catch((err) => {
        console.error("Background extraction error:", err);
      });

    return NextResponse.json({
      success: true,
      responseId: savedResponse.id,
    });
  } catch (error) {
    console.error("Onboarding answer error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
