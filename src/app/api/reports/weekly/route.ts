import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { generateWeeklyReview } from "@/lib/plans/weekly-review-generator";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const force = new URL(req.url).searchParams.get("force") === "true";

  try {
    if (force) {
      const start = new Date();
      start.setDate(start.getDate() - start.getDay());
      const weekStart = start.toISOString().split("T")[0];
      await supabase
        .from("weekly_reviews")
        .delete()
        .eq("user_id", user.id)
        .eq("week_start", weekStart);
    }
    const result = await generateWeeklyReview(supabase, user.id);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Weekly review error:", error);
    return NextResponse.json({ error: "Failed to generate weekly review" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
