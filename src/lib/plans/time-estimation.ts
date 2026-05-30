import type { SupabaseClient } from "@supabase/supabase-js";

export interface TimeEstimationProfile {
  sampleSize: number;
  avgEstimatedMinutes: number;
  avgActualMinutes: number;
  estimationRatio: number;
  insight: string | null;
}

export async function fetchTimeEstimationProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<TimeEstimationProfile> {
  const { data } = await supabase
    .from("tasks")
    .select("estimated_minutes, actual_minutes")
    .eq("user_id", userId)
    .eq("status", "completed")
    .not("estimated_minutes", "is", null)
    .not("actual_minutes", "is", null)
    .order("completed_at", { ascending: false })
    .limit(40);

  const rows = (data || []).filter(
    (r) => r.estimated_minutes && r.actual_minutes && r.estimated_minutes > 0
  );

  if (rows.length < 3) {
    return {
      sampleSize: rows.length,
      avgEstimatedMinutes: 60,
      avgActualMinutes: 60,
      estimationRatio: 1,
      insight: null,
    };
  }

  const avgEstimated =
    rows.reduce((s, r) => s + (r.estimated_minutes as number), 0) / rows.length;
  const avgActual =
    rows.reduce((s, r) => s + (r.actual_minutes as number), 0) / rows.length;
  const ratio = avgActual / avgEstimated;

  let insight: string | null = null;
  if (ratio >= 1.35) {
    insight = `You consistently estimate ${Math.round(avgEstimated)}-minute tasks that take ~${Math.round(avgActual)} minutes. Plans will allocate extra time.`;
  } else if (ratio <= 0.75) {
    insight = `You often finish faster than estimated (~${Math.round(ratio * 100)}% of planned time). Plans can be slightly more ambitious.`;
  }

  return {
    sampleSize: rows.length,
    avgEstimatedMinutes: Math.round(avgEstimated),
    avgActualMinutes: Math.round(avgActual),
    estimationRatio: Math.round(ratio * 100) / 100,
    insight,
  };
}

export function adjustMinutesForUser(
  minutes: number,
  ratio: number,
  mode: "conservative" | "normal" | "aggressive"
): number {
  let adjusted = minutes;
  if (ratio > 1.1) adjusted = Math.round(minutes * ratio);
  if (mode === "aggressive" && ratio <= 1.1) adjusted = Math.round(minutes * 0.9);
  if (mode === "conservative") adjusted = Math.round(minutes * Math.max(ratio, 1));
  return Math.min(180, Math.max(30, adjusted));
}
