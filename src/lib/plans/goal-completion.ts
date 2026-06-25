import { getOpenAI } from "@/lib/ai/openai";
import { DEEP_MODEL } from "@/lib/ai/models";
import { logAiUsage } from "@/lib/ai/usage-guard";
import { queueSuggestion } from "@/lib/ai/memory-confidence";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface CompletionReview {
  summary: string;
  biggestWin: string;
  keyLearning: string;
  timelineEntry: string;
  suggestedNext?: string;
}

export async function completeGoal(
  supabase: SupabaseClient,
  userId: string,
  goalId: string
): Promise<{ review: CompletionReview; goalTitle: string }> {
  const { data: goal, error } = await supabase
    .from("goals")
    .select("id, title, description, life_area, target_date, status")
    .eq("id", goalId)
    .eq("user_id", userId)
    .eq("goal_kind", "execution")
    .single();

  if (error || !goal) throw new Error("Goal not found");
  if (goal.status === "completed") throw new Error("Goal already completed");

  const { data: milestones } = await supabase
    .from("goal_milestones")
    .select("title, status")
    .eq("goal_id", goalId)
    .order("sort_order", { ascending: true });

  const { data: tasks } = await supabase
    .from("tasks")
    .select("title, status")
    .eq("goal_id", goalId)
    .limit(30);

  const completedTasks = (tasks || []).filter((t) => t.status === "completed");
  const review = await generateCompletionReview(
    userId,
    goal.title,
    goal.description,
    goal.life_area,
    milestones || [],
    completedTasks.map((t) => t.title)
  );

  const now = new Date().toISOString();

  await supabase
    .from("goal_milestones")
    .update({ status: "completed", completed_at: now })
    .eq("goal_id", goalId)
    .neq("status", "completed");

  await supabase
    .from("goals")
    .update({
      status: "completed",
      progress: 100,
      completed_at: now,
      completion_review: review,
    })
    .eq("id", goalId);

  await supabase
    .from("profiles")
    .update({ current_focus_goal_id: null, current_focus_until: null })
    .eq("id", userId)
    .eq("current_focus_goal_id", goalId);

  await supabase
    .from("tasks")
    .update({ status: "skipped" })
    .eq("goal_id", goalId)
    .in("status", ["pending", "in_progress"]);

  if (review.suggestedNext) {
    const defaultDeadline = new Date();
    defaultDeadline.setDate(defaultDeadline.getDate() + 30);
    await queueSuggestion(supabase, {
      userId,
      type: "initiative",
      title: review.suggestedNext,
      payload: {
        description: `Follow-up after completing: ${goal.title}`,
        targetDate: defaultDeadline.toISOString().split("T")[0],
        lifeArea: goal.life_area || "personal",
      },
      confidence: 0.75,
    });
  }

  return { review, goalTitle: goal.title };
}

async function generateCompletionReview(
  userId: string,
  title: string,
  description: string | null,
  lifeArea: string,
  milestones: Array<{ title: string; status: string }>,
  completedTaskTitles: string[]
): Promise<CompletionReview> {
  const prompt = `Generate a goal completion review. JSON only.

Goal: ${title}
Life area: ${lifeArea}
${description ? `Context: ${description}` : ""}

Milestones:
${milestones.map((m) => `- ${m.title} (${m.status})`).join("\n") || "None"}

Completed tasks:
${completedTaskTitles.map((t) => `- ${t}`).join("\n") || "None logged"}

Return:
{
  "summary": "2-3 sentences — what was accomplished",
  "biggestWin": "One concrete win",
  "keyLearning": "One lesson for next time",
  "timelineEntry": "One line for memory timeline e.g. 'Completed MVP launch'",
  "suggestedNext": "Optional next goal title (same life area) or omit if unclear"
}

Use language matching the life area — no startup jargon for fitness/study goals.`;

  try {
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: DEEP_MODEL,
      temperature: 0.35,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Goal completion coach. Domain-appropriate language. JSON only." },
        { role: "user", content: prompt },
      ],
    });

    await logAiUsage(
      userId,
      "goal_complete",
      DEEP_MODEL,
      completion.usage?.prompt_tokens ?? 0,
      completion.usage?.completion_tokens ?? 0
    );

    const raw = completion.choices[0]?.message?.content;
    if (raw) {
      return JSON.parse(raw) as CompletionReview;
    }
  } catch {
    /* fallback */
  }

  return {
    summary: `You completed "${title}".`,
    biggestWin: completedTaskTitles[0] || "Finished the goal",
    keyLearning: "Consistency on the active milestone drove progress.",
    timelineEntry: `Completed: ${title}`,
    suggestedNext: undefined,
  };
}
