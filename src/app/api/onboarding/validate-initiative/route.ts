import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { assessGoalQuality, assessGoalWithLLM } from "@/lib/goals/goal-quality-gate";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { title, directions, buildingWhat } = body as {
    title?: string;
    directions?: string[];
    buildingWhat?: string;
  };

  if (!title?.trim()) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }

  let assessment = assessGoalQuality(title, {
    directions,
    buildingWhat: buildingWhat || null,
  });

  // Heuristic sharpen options are enough — LLM often returns equally vague alternatives
  if (
    assessment.needsSharpening &&
    (!assessment.sharpenOptions?.length || assessment.sharpenOptions.length < 2)
  ) {
    const llmSharpen = await assessGoalWithLLM(title);
    if (llmSharpen) {
      assessment = {
        ...assessment,
        sharpenPrompt: llmSharpen.sharpenPrompt,
        sharpenOptions: llmSharpen.sharpenOptions,
        message: llmSharpen.message || assessment.message,
      };
    }
  }

  return NextResponse.json({
    valid: assessment.valid,
    kind: assessment.kind,
    quality: assessment.quality,
    needsSharpening: assessment.needsSharpening,
    sharpenPrompt: assessment.sharpenPrompt,
    sharpenOptions: assessment.sharpenOptions,
    exampleTitle: assessment.sharpenOptions?.[0]?.resultTitle,
    title: assessment.title,
    message: assessment.message,
    suggestions: assessment.suggestions,
  });
}
