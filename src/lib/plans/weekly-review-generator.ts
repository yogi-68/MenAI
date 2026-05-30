import { getOpenAI } from "@/lib/ai/openai";
import { computeInitiativeHealth } from "@/lib/plans/initiative-health";
import { fetchExecutionMetrics } from "@/lib/plans/execution-rate";
import { computeMomentumScore } from "@/lib/plans/momentum-score";
import { computeLifeAreaBalance, lifeAreaLabel } from "@/lib/plans/life-areas";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface WeeklyReviewContent {
  biggestWin: string;
  biggestBottleneck: string;
  initiativeHealthChanges: string[];
  lifeAreaDistribution: string;
  opportunitiesSummary: string;
  focusRecommendation: string;
  executionSummary: string;
  momentumScore: number;
  narrative: string;
}

function weekBounds(date = new Date()) {
  const start = new Date(date);
  start.setDate(date.getDate() - date.getDay());
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return {
    weekStart: start.toISOString().split("T")[0],
    weekEnd: end.toISOString().split("T")[0],
  };
}

export async function generateWeeklyReview(
  supabase: SupabaseClient,
  userId: string
): Promise<{ review: WeeklyReviewContent; weekStart: string; weekEnd: string; cached: boolean }> {
  const { weekStart, weekEnd } = weekBounds();

  const { data: existing } = await supabase
    .from("weekly_reviews")
    .select("content")
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .maybeSingle();

  if (existing?.content) {
    return {
      review: existing.content as WeeklyReviewContent,
      weekStart,
      weekEnd,
      cached: true,
    };
  }

  const [execution, momentum, tasksRes, initiativesRes, opportunitiesRes, reflectionsRes] =
    await Promise.all([
      fetchExecutionMetrics(supabase, userId),
      computeMomentumScore(supabase, userId),
      supabase
        .from("tasks")
        .select("status, completed_at, due_date, title, estimated_minutes, initiatives(life_area, title)")
        .eq("user_id", userId)
        .gte("due_date", weekStart)
        .lte("due_date", weekEnd),
      supabase
        .from("initiatives")
        .select("title, life_area, target_date, last_action_at, progress, status")
        .eq("user_id", userId),
      supabase
        .from("opportunities")
        .select("title, urgency, status, due_date, life_area")
        .eq("user_id", userId),
      supabase
        .from("daily_reflections")
        .select("moved_forward, blocked_by, tomorrow_context, reflection_date")
        .eq("user_id", userId)
        .gte("reflection_date", weekStart)
        .lte("reflection_date", weekEnd),
    ]);

  const tasks = tasksRes.data || [];
  const initiatives = initiativesRes.data || [];
  const opportunities = opportunitiesRes.data || [];
  const reflections = reflectionsRes.data || [];

  const balance = computeLifeAreaBalance(
    tasks.map((t) => ({
      life_area: (t.initiatives as { life_area?: string } | null)?.life_area || "personal",
      status: t.status,
      completed_at: t.completed_at,
      due_date: t.due_date,
    }))
  );

  const initiativeHealth = initiatives.map((i) => {
    const h = computeInitiativeHealth({
      status: i.status,
      targetDate: i.target_date,
      lastActionAt: i.last_action_at,
      progress: i.progress,
    });
    return `${i.title} (${lifeAreaLabel(i.life_area)}): ${h.label} — ${h.reason}`;
  });

  const activeOpps = opportunities.filter((o) => o.status === "active");
  const reflectionLines = reflections.map(
    (r) => `[${r.reflection_date}] Forward: ${r.moved_forward} | Blocked: ${r.blocked_by}`
  );

  const prompt = `Generate a weekly execution review for this user. Be direct like an execution coach — no gamification, no fluff.

Week: ${weekStart} to ${weekEnd}

Execution rate (planned tasks): ${execution.last7Days.rate}% (${execution.last7Days.completed}/${execution.last7Days.total})
Momentum score: ${momentum.score}/100 (${momentum.label})
Momentum factors: ${momentum.factors.join("; ") || "None"}

Initiative health:
${initiativeHealth.join("\n") || "No initiatives"}

Life area activity:
${balance.filter((b) => b.plannedTasks > 0).map((b) => `${b.label}: ${b.completedTasks}/${b.plannedTasks} tasks`).join("\n") || "No activity"}

Active opportunities:
${activeOpps.map((o) => `${o.title} (${o.urgency}, due ${o.due_date || "none"})`).join("\n") || "None"}

Daily reflections this week:
${reflectionLines.join("\n") || "No reflections logged"}

Return JSON:
{
  "biggestWin": "One sentence",
  "biggestBottleneck": "One sentence",
  "initiativeHealthChanges": ["bullet points"],
  "lifeAreaDistribution": "2-3 sentences on where attention went",
  "opportunitiesSummary": "What was gained/lost/untouched",
  "focusRecommendation": "Clear focus for next week",
  "executionSummary": "One sentence on execution quality",
  "narrative": "3-5 sentence coach summary tying it all together"
}`;

  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.4,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "Execution coach weekly review. JSON only." },
      { role: "user", content: prompt },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty AI response");

  const parsed = JSON.parse(raw) as Omit<WeeklyReviewContent, "momentumScore">;

  const review: WeeklyReviewContent = {
    ...parsed,
    momentumScore: momentum.score,
    initiativeHealthChanges: parsed.initiativeHealthChanges || [],
  };

  await supabase.from("weekly_reviews").insert({
    user_id: userId,
    week_start: weekStart,
    week_end: weekEnd,
    content: review,
  });

  return { review, weekStart, weekEnd, cached: false };
}
