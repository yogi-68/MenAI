import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. Fetch reports
    const { data: reports, error } = await supabase
      .from("behavioral_reports")
      .select("*")
      .order("report_date", { ascending: false })
      .limit(10);

    if (error) {
      console.error("[API/Reports] Error fetching reports:", error);
      return NextResponse.json({ error: "Failed to fetch reports" }, { status: 500 });
    }

    return NextResponse.json({ reports });
  } catch (error) {
    console.error("[API/Reports] Internal error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // In a real implementation, this would be a CRON job or long-running 
    // background task that aggregates data from the past 7 days.
    // For now, we simulate generation of a weekly report.

    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 7);

    // Simulated data generation (this would normally call a specialized reporting engine)
    const reportContent = {
      momentum_shift: "improving",
      key_insights: [
        "You executed well on high-priority tasks in the morning.",
        "Your focus tended to drift on Thursdays."
      ],
      validated_predictions: [
        "Successfully avoided the burnout risk predicted on Tuesday."
      ],
      upcoming_risks: [
        "Potential scope creep on the new marketing project."
      ]
    };

    const { data: report, error } = await supabase
      .from("behavioral_reports")
      .insert({
        user_id: user.id,
        report_date: end.toISOString().split('T')[0],
        period_start: start.toISOString(),
        period_end: end.toISOString(),
        report_content: reportContent
      })
      .select()
      .single();

    if (error) {
      console.error("[API/Reports] Error creating report:", error);
      return NextResponse.json({ error: "Failed to create report" }, { status: 500 });
    }

    return NextResponse.json({ report });
  } catch (error) {
    console.error("[API/Reports] Internal error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
