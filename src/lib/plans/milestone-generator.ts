import { getOpenAI } from "@/lib/ai/openai";
import { DEEP_MODEL } from "@/lib/ai/models";
import { logAiUsage } from "@/lib/ai/usage-guard";
import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULTS_BY_AREA: Record<string, string[]> = {
  health: [
    "Define nutrition baseline",
    "Build training routine",
    "Establish daily consistency",
    "Reach target weight checkpoint",
  ],
  learning: [
    "Map syllabus and study timeline",
    "Daily study rhythm",
    "Mock tests and weak areas",
    "Exam readiness",
  ],
  career: [
    "Define target role and criteria",
    "Skills and preparation plan",
    "Applications or interviews",
    "Land the outcome",
  ],
  business: [
    "Define problem and success criteria",
    "Complete first meaningful deliverable",
    "Get first external feedback",
    "Ship or validate v1",
  ],
  personal: [
    "Clarify the outcome",
    "First meaningful step",
    "Build consistency",
    "Complete the initiative",
  ],
};

export async function generateMilestonesForInitiative(
  supabase: SupabaseClient,
  userId: string,
  initiativeId: string,
  title: string,
  description?: string | null,
  lifeArea = "personal"
): Promise<void> {
  const { count } = await supabase
    .from("initiative_milestones")
    .select("id", { count: "exact", head: true })
    .eq("initiative_id", initiativeId);

  if ((count ?? 0) > 0) return;

  const area = lifeArea in DEFAULTS_BY_AREA ? lifeArea : "personal";
  let titles = DEFAULTS_BY_AREA[area];

  try {
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: DEEP_MODEL,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Generate 4-5 sequential milestones for a ${area} initiative. Each milestone is a phase, not a daily task.

RULES:
- Match language to life area (${area})
- health: nutrition, training, consistency, target weight — NEVER SaaS/MVP/customer language
- learning: syllabus, study blocks, mocks, exam readiness — NEVER startup/outreach language
- career: role prep, skills, applications, outcome
- business: only area where MVP/customer/launch language is OK
JSON only: {"milestones": ["..."]}`,
        },
        {
          role: "user",
          content: `Initiative: ${title}\n${description ? `Context: ${description}` : ""}\nReturn milestones from first step to outcome.`,
        },
      ],
    });

    await logAiUsage(
      userId,
      "milestone_gen",
      DEEP_MODEL,
      completion.usage?.prompt_tokens ?? 0,
      completion.usage?.completion_tokens ?? 0
    );

    const raw = completion.choices[0]?.message?.content;
    if (raw) {
      const parsed = JSON.parse(raw) as { milestones?: string[] };
      if (parsed.milestones?.length) titles = parsed.milestones.slice(0, 6);
    }
  } catch {
    /* use defaults */
  }

  await supabase.from("initiative_milestones").insert(
    titles.map((t, i) => ({
      user_id: userId,
      initiative_id: initiativeId,
      title: t.slice(0, 200),
      sort_order: i,
      status: i === 0 ? "in_progress" : "pending",
    }))
  );
}
