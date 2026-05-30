import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildCognitiveState } from "@/lib/ai/orchestrator/cognition-engine";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(_request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const state = await buildCognitiveState(user.id);

    return NextResponse.json({
      success: true,
      cognitiveState: state,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Snapshot generation error:", error);
    return NextResponse.json({ error: "Failed to generate snapshot" }, { status: 500 });
  }
}

export async function GET(_request: NextRequest) {
  return POST(_request);
}
