import { getOpenAI } from "@/lib/ai/openai";
import { DEEP_MODEL } from "@/lib/ai/models";
import { logAiUsage } from "@/lib/ai/usage-guard";
import {
  filterConcreteMilestones,
  isAbstractMilestone,
  MILESTONE_QUALITY_PROMPT,
} from "@/lib/plans/milestone-quality";
import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULTS_BY_AREA: Record<string, string[]> = {
  health: [
    "Record weight and waist measurement",
    "Set daily calorie target and 7-day meal template",
    "Complete first 10 workouts",
    "Lose first 2 kg",
    "Reach target body fat percentage",
  ],
  learning: [
    "Complete syllabus map with weekly targets",
    "Finish first 40 practice questions and mark weak topics",
    "Complete first full mock test under timed conditions",
    "Raise mock score to target pass mark",
    "Pass the exam or final assessment",
  ],
  career: [
    "List 10 target roles and required skills",
    "Update resume and LinkedIn for target role",
    "Send 15 tailored applications",
    "Complete 5 mock interviews",
    "Receive and accept offer",
  ],
  business: [
    "Write one-page problem statement and success metric",
    "Ship first working prototype",
    "Get feedback from 5 real users",
    "Get first paying customer",
    "Hit first revenue milestone",
  ],
  finance: [
    "Record all income and expenses for 30 days",
    "Set monthly savings target and automate transfer",
    "Pay off first high-interest debt chunk",
    "Build 1-month emergency buffer",
    "Hit savings goal for this initiative",
  ],
  relationships: [
    "Schedule 3 meaningful conversations this month",
    "Complete one shared activity or date per week for 4 weeks",
    "Resolve one open conflict with a clear next step",
    "Establish weekly check-in ritual",
    "Reach defined relationship outcome",
  ],
  personal: [
    "Define one measurable outcome and deadline",
    "Complete first concrete deliverable",
    "Log progress daily for 14 days",
    "Hit midpoint checkpoint",
    "Finish the initiative outcome",
  ],
};

export async function generateMilestonesForInitiative(
  supabase: SupabaseClient,
  userId: string,
  initiativeId: string,
  title: string,
  description?: string | null,
  lifeArea = "personal",
  force = false
): Promise<void> {
  const { count } = await supabase
    .from("initiative_milestones")
    .select("id", { count: "exact", head: true })
    .eq("initiative_id", initiativeId);

  if ((count ?? 0) > 0 && !force) return;

  if (force && (count ?? 0) > 0) {
    await supabase.from("initiative_milestones").delete().eq("initiative_id", initiativeId);
  }

  const area = areaKey(lifeArea);
  const corpus = `${title} ${description || ""}`.toLowerCase();
  let titles = fitnessBodyFatDefaults(corpus) || DEFAULTS_BY_AREA[area];

  try {
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: DEEP_MODEL,
      temperature: 0.25,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Generate 4-6 sequential milestones for a ${area} initiative.

${MILESTONE_QUALITY_PROMPT}

Each milestone title must start with an action verb or include a number.
Match domain: health = weight/workouts/meals; learning = syllabus/mocks/scores; business = ship/users/revenue.

JSON only: {"milestones": ["...", "..."]}`,
        },
        {
          role: "user",
          content: `Initiative: ${title}\n${description ? `Context: ${description}` : ""}\nReturn concrete milestones from first physical action to outcome.`,
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
      const filtered = filterConcreteMilestones(parsed.milestones || []);
      if (filtered.length >= 3) titles = filtered.slice(0, 6);
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

  await regenerateMilestonesIfAbstract(
    supabase,
    userId,
    initiativeId,
    title,
    description,
    lifeArea
  );
}

/** Replace abstract milestone labels with concrete ones. */
export async function regenerateMilestonesIfAbstract(
  supabase: SupabaseClient,
  userId: string,
  initiativeId: string,
  title: string,
  description?: string | null,
  lifeArea = "personal"
): Promise<boolean> {
  const { data: existing } = await supabase
    .from("initiative_milestones")
    .select("title")
    .eq("initiative_id", initiativeId)
    .eq("user_id", userId);

  if (!existing?.length) return false;
  const abstractCount = existing.filter((m) => isAbstractMilestone(m.title)).length;
  if (abstractCount < Math.ceil(existing.length / 2)) return false;

  await generateMilestonesForInitiative(
    supabase,
    userId,
    initiativeId,
    title,
    description,
    lifeArea,
    true
  );
  return true;
}

function fitnessBodyFatDefaults(corpus: string): string[] | null {
  if (!/body fat|fat %|\d{1,2}% body|lean bulk|cut to/i.test(corpus)) return null;
  return [
    "Record current weight and waist measurement",
    "Calculate maintenance calories and daily deficit target",
    "Log meals for 14 consecutive days",
    "Complete 10 strength training workouts",
    "Reach 20% body fat checkpoint",
    "Reach 18% body fat checkpoint",
    "Reach 15% body fat",
  ];
}

// fix typo - used `area` before defined
function areaKey(lifeArea: string): keyof typeof DEFAULTS_BY_AREA {
  return lifeArea in DEFAULTS_BY_AREA ? (lifeArea as keyof typeof DEFAULTS_BY_AREA) : "personal";
}
