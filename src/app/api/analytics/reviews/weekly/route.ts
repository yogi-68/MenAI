import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { generateWeeklyReview } from "@/lib/plans/weekly-review-generator";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const result = await generateWeeklyReview(supabase, user.id);
    return NextResponse.json({
      review: result.review,
      weekStart: result.weekStart,
      weekEnd: result.weekEnd,
      cached: result.cached,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate review";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
