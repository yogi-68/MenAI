import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getUserContext } from "@/lib/context/user-context";

export const runtime = "nodejs";

/** Dynamic suggested prompts based on active goals + rhythm phase */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getUserContext(supabase, user.id);
  const goals = ctx.activeGoals.slice(0, 3);
  const primary = goals[0];
  const completed = ctx.todayPlan.filter((t) => t.status === "completed").length;
  const remaining = ctx.todayPlan.length - completed;

  const prompts: string[] = [];

  if (primary) {
    prompts.push(`What's blocking progress on ${primary.title}?`);
  }

  if (remaining > 0) {
    prompts.push(`Help me finish my ${remaining} remaining task${remaining === 1 ? "" : "s"} today`);
  } else if (ctx.rhythmPhase === "morning") {
    prompts.push("What should I prioritize this morning?");
  } else {
    prompts.push("Review my execution pace this week");
  }

  if (primary && !primary.targetDate) {
    prompts.push(`Add a deadline to ${primary.title}`);
  } else if (goals.length > 1) {
    prompts.push(`Which goal needs attention — ${goals.map((g) => g.title).slice(0, 2).join(" or ")}?`);
  } else {
    prompts.push("Sharpen my goal for the next 30 days");
  }

  const unique = [...new Set(prompts.map((p) => p.trim()))].slice(0, 3);

  return NextResponse.json({ prompts: unique });
}
