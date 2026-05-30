import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchExecutionMetrics } from "@/lib/plans/execution-rate";
import {
  computeMomentumScore,
  computePlanReturnRate,
} from "@/lib/plans/momentum-score";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [metrics, momentum, planReturn] = await Promise.all([
    fetchExecutionMetrics(supabase, user.id),
    computeMomentumScore(supabase, user.id),
    computePlanReturnRate(supabase, user.id),
  ]);

  return NextResponse.json({ metrics, momentum, planReturn });
}
