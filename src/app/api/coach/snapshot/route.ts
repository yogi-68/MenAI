import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getUserContext } from "@/lib/context/user-context";

export const runtime = "nodejs";

function formatMessageTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();
}

/** GET /api/coach/snapshot — lightweight data for persistent coach rail */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [userContext, convRes] = await Promise.all([
    getUserContext(supabase, user.id),
    supabase
      .from("conversations")
      .select("id")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
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
        content: latest.content.slice(0, 500),
        createdAt: latest.created_at,
        timeLabel: formatMessageTime(latest.created_at),
      };
    }
    if (earlier?.content) {
      earlierMessage = { content: earlier.content.slice(0, 400) };
    }
  }

  const phase = userContext.rhythmPhase;
  const completed = userContext.todayPlan.filter((t) => t.status === "completed").length;
  const expected = userContext.todayPlan.length;

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
  });
}
