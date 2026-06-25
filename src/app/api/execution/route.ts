import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchExecutionMetrics } from "@/lib/plans/execution-rate";
import { computePerformanceScore } from "@/lib/plans/performance-score";
import { computePlanReturnRate } from "@/lib/plans/momentum-score";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [metrics, performance, planReturn] = await Promise.all([
    fetchExecutionMetrics(supabase, user.id),
    computePerformanceScore(supabase, user.id),
    computePlanReturnRate(supabase, user.id),
  ]);

  return NextResponse.json({ metrics, performance, planReturn });
}
