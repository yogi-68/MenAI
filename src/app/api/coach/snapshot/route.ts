import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getUserContext } from "@/lib/context/user-context";

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

  const [userContext, convRes, dailyNoteRes] = await Promise.all([
    getUserContext(supabase, user.id),
    supabase
      .from("conversations")
      .select("id")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
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

  let lastMessage: { content: string; createdAt: string; timeLabel: string } | null = null;
  let earlierMessage: { content: string } | null = null;

  if (convRes.data?.id) {
    const { data: messages } = await supabase
      .from("messages")
      .select("role, content, created_at")
      .eq("conversation_id", convRes.data.id)
      .eq("role", "assistant")
      .order("created_at", { ascending: false })
      .limit(2);

    const latest = messages?.[0];
    const earlier = messages?.[1];
    if (latest?.content) {
      lastMessage = {
        content: trimAtSentence(latest.content, 500),
        createdAt: latest.created_at,
        timeLabel: formatMessageTime(latest.created_at),
      };
    }
    if (earlier?.content) {
      earlierMessage = { content: trimAtSentence(earlier.content, 400) };
    }
  }

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

  return NextResponse.json({
    score: userContext.scoreToday,
    phase,
    statusLabel: `Score ${userContext.scoreToday} · ${phase}`,
    tasksCompletedToday: completed,
    tasksDueToday: expected,
    lastMessage,
    earlierMessage,
    knows: userContext.knowledgeBullets,
    lastAchievement: userContext.lastAchievement,
    dailyNote,
  });
}
