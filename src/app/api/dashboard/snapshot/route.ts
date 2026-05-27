/**
 * Dashboard Snapshot API
 * 
 * Regenerates dashboard intelligence on-demand.
 * Called after extractions complete to ensure fresh data.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { generateDashboardIntelligence } from "@/lib/dashboard/synthesis";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Generate fresh dashboard intelligence
    const intelligence = await generateDashboardIntelligence(user.id);

    return NextResponse.json({
      success: true,
      intelligence,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Snapshot generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate snapshot" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Generate fresh dashboard intelligence
    const intelligence = await generateDashboardIntelligence(user.id);

    return NextResponse.json({
      success: true,
      intelligence,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Snapshot generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate snapshot" },
      { status: 500 }
    );
  }
}
