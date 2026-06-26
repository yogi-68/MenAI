import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getUserContext } from "@/lib/context/user-context";
import { getUserModel } from "@/lib/user-model/loader";

export const runtime = "nodejs";

function formatMessageTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();
}

function trimAtSentence(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const lastPeriod = Math.max(
    cut.lastIndexOf(". "),
    cut.lastIndexOf("! "),
    cut.lastIndexOf("? ")
  );
  if (lastPeriod > maxChars * 0.6) return cut.slice(0, lastPeriod + 1);
  const lastSpace = cut.lastIndexOf(" ");
  return lastSpace > 0 ? cut.slice(0, lastSpace) + "\u2026" : cut + "\u2026";
}

/** GET /api/coach/snapshot — lightweight data for persistent coach rail */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [userContext, userModel, dailyNoteRes] = await Promise.all([
    getUserContext(supabase, user.id),
    getUserModel(supabase, user.id),
    supabase
      .from("mentor_memories")
      .select("text")
      .eq("user_id", user.id)
      .eq("memory_type", "daily_note")
      .eq("status", "active")
      .order("last_mentioned_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const phase = userContext.rhythmPhase;
  const completed = userContext.todayPlan.filter((t) => t.status === "completed").length;
  const expected = userContext.todayPlan.length;

  // Calibration question from today's plan takes priority over daily note
  const today = new Date().toISOString().split("T")[0];
  const { data: todayPlan } = await supabase
    .from("daily_plans")
    .select("plan_content")
    .eq("user_id", user.id)
    .eq("plan_date", today)
    .maybeSingle();
  const calibrationQuestion = (todayPlan?.plan_content as { calibrationQuestion?: string } | null)?.calibrationQuestion ?? null;
  const dailyNote = calibrationQuestion ?? dailyNoteRes.data?.text ?? null;

  // Find lowest-confidence goal for precision CTA
  const goalConfidence = userModel.goalConfidence ?? {};
  let precisionCTA: { goalId: string; goalTitle: string; score: number; factor: string } | null = null;
  const lowEntries = Object.entries(goalConfidence)
    .filter(([, b]) => b.total < 70 && b.missingFactors?.length > 0)
    .sort(([, a], [, b]) => a.total - b.total);
  if (lowEntries.length > 0) {
    const [goalId, breakdown] = lowEntries[0];
    const { data: goalRow } = await supabase
      .from("goals")
      .select("title")
      .eq("id", goalId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (goalRow?.title) {
      precisionCTA = {
        goalId,
        goalTitle: goalRow.title,
        score: breakdown.total,
        factor: breakdown.missingFactors[0]?.factor ?? "deadline",
      };
    }
  }

  return NextResponse.json({
    score: userContext.scoreToday,
    phase,
    statusLabel: `Score ${userContext.scoreToday} · ${phase}`,
    tasksCompletedToday: completed,
    tasksDueToday: expected,
    knows: userContext.knowledgeBullets,
    lastAchievement: userContext.lastAchievement,
    dailyNote,
    precisionCTA,
  });
}
