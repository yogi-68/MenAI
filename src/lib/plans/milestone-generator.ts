import { getOpenAI } from "@/lib/ai/openai";
import { DEEP_MODEL } from "@/lib/ai/models";
import { logAiUsage } from "@/lib/ai/usage-guard";
import {
  filterConcreteMilestones,
  isAbstractMilestone,
  MILESTONE_QUALITY_PROMPT,
} from "@/lib/plans/milestone-quality";
import type { SupabaseClient } from "@supabase/supabase-js";

export type GoalStage = "exploring" | "first_client" | "has_clients" | "scaling";

const STAGE_MILESTONES: Record<GoalStage, string[]> = {
  exploring: [
    "Interview 5 potential customers",
    "Write one-page problem and offer hypothesis",
    "List 10 ways to validate demand this month",
    "Run one validation test with real feedback",
    "Decide go/no-go on offer",
  ],
  first_client: [
    "Define service offer and pricing",
    "Create outreach list of 50 prospects",
    "Contact 20 prospects",
    "Book 3 discovery calls",
    "Sign first client",
    "Deliver first project",
  ],
  has_clients: [
    "Document delivery playbook for repeat work",
    "Raise prices or package offer",
    "Get 2 referrals from existing clients",
    "Hit monthly revenue target",
    "Systematize client onboarding",
  ],
  scaling: [
    "Hire or delegate first repeatable task",
    "Raise capacity without quality drop",
    "Hit next revenue milestone",
    "Reduce founder time per delivery hour",
  ],
};

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
  business: STAGE_MILESTONES.first_client,
  finance: STAGE_MILESTONES.first_client,
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
    "Finish the goal outcome",
  ],
};

const ANTI_HALLUCINATION = `
NEVER invent milestones the user did not imply:
- NO workshops, certifications, courses, or "attend X events" unless explicitly in goal context
- NO generic "track income/expenses" unless goal is explicitly personal finance tracking
- NO outreach/email tasks unless business/client acquisition is the goal
- Use ONLY goal title, description, success criteria, stage, and life area as evidence
`.trim();

export async function generateMilestonesForGoal(
  supabase: SupabaseClient,
  userId: string,
  goalId: string,
  title: string,
  description?: string | null,
  lifeArea = "personal",
  force = false,
  stage?: GoalStage | null
): Promise<void> {
  const { count } = await supabase
    .from("goal_milestones")
    .select("id", { count: "exact", head: true })
    .eq("goal_id", goalId);

  if ((count ?? 0) > 0 && !force) return;

  if (force && (count ?? 0) > 0) {
    await supabase.from("goal_milestones").delete().eq("goal_id", goalId);
  }

  const area = areaKey(lifeArea);
  const corpus = `${title} ${description || ""}`.toLowerCase();
  const businessLike = area === "business" || area === "finance" || /agency|client|saas|startup/.test(corpus);
  const resolvedStage = stage || (businessLike ? "first_client" : null);

  let titles =
    fitnessBodyFatDefaults(corpus) ||
    (resolvedStage && businessLike ? STAGE_MILESTONES[resolvedStage] : null) ||
    DEFAULTS_BY_AREA[area];

  try {
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: DEEP_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Generate 4-6 sequential milestones for a ${area} goal.

${MILESTONE_QUALITY_PROMPT}

${ANTI_HALLUCINATION}

${resolvedStage ? `Stage: ${resolvedStage} — milestones must match this stage exactly.` : ""}

Each milestone title must start with an action verb or include a number.
JSON only: {"milestones": ["...", "..."]}`,
        },
        {
          role: "user",
          content: `Goal: ${title}
${description ? `Context: ${description}` : ""}
${resolvedStage ? `Stage: ${resolvedStage}` : ""}
Return concrete milestones from first physical action to outcome. No workshops unless user mentioned workshops.`,
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
      const filtered = filterConcreteMilestones(parsed.milestones || []).filter(
        (t) => !/\bworkshop|certification|course\b/i.test(t) || /workshop|certification|course/i.test(corpus)
      );
      if (filtered.length >= 3) titles = filtered.slice(0, 6);
    }
  } catch {
    /* use defaults */
  }

  await supabase.from("goal_milestones").insert(
    titles.map((t, i) => ({
      user_id: userId,
      goal_id: goalId,
      title: t.slice(0, 200),
      sort_order: i,
      status: i === 0 ? "in_progress" : "pending",
    }))
  );

  await regenerateMilestonesIfAbstract(
    supabase,
    userId,
    goalId,
    title,
    description,
    lifeArea
  );
}

/** Replace abstract milestone labels with concrete ones. */
export async function regenerateMilestonesIfAbstract(
  supabase: SupabaseClient,
  userId: string,
  goalId: string,
  title: string,
  description?: string | null,
  lifeArea = "personal"
): Promise<boolean> {
  const { data: existing } = await supabase
    .from("goal_milestones")
    .select("title")
    .eq("goal_id", goalId)
    .eq("user_id", userId);

  if (!existing?.length) return false;
  const abstractCount = existing.filter((m) => isAbstractMilestone(m.title)).length;
  const hallucinated = existing.filter((m) =>
    /\bworkshop|certification\b/i.test(m.title)
  ).length;
  if (abstractCount < Math.ceil(existing.length / 2) && hallucinated === 0) return false;

  await generateMilestonesForGoal(
    supabase,
    userId,
    goalId,
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

function areaKey(lifeArea: string): keyof typeof DEFAULTS_BY_AREA {
  return lifeArea in DEFAULTS_BY_AREA ? (lifeArea as keyof typeof DEFAULTS_BY_AREA) : "personal";
}
