import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { assessInitiativeQuality } from "@/lib/initiatives/initiative-quality-gate";

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

  const assessment = assessInitiativeQuality(title, {
    directions,
    buildingWhat: buildingWhat || null,
  });

  return NextResponse.json({
    valid: assessment.valid,
    kind: assessment.kind,
    quality: assessment.quality,
    needsSharpening: assessment.needsSharpening,
    sharpenPrompt: assessment.sharpenPrompt,
    sharpenOptions: assessment.sharpenOptions,
    title: assessment.title,
    message: assessment.message,
    suggestions: assessment.suggestions,
  });
}
