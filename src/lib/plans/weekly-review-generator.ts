import { getOpenAI } from "@/lib/ai/openai";
import { DEEP_MODEL } from "@/lib/ai/models";
import { computeInitiativeHealth } from "@/lib/plans/initiative-health";
import { fetchExecutionMetrics } from "@/lib/plans/execution-rate";
import { computeMomentumScore } from "@/lib/plans/momentum-score";
import { lifeAreaLabel } from "@/lib/plans/life-areas";
import { buildMemoryTimeline } from "@/lib/plans/memory-timeline";
import { getUserModel } from "@/lib/user-model/loader";
import { formatUserModelForPrompt } from "@/lib/user-model/format-for-prompt";
import { logAiUsage, checkAiQuota, AI_UNAVAILABLE_MESSAGE } from "@/lib/ai/usage-guard";
import type { SupabaseClient } from "@supabase/supabase-js";

/** User-facing weekly review — no scores or percentages in these fields. */
export interface WeeklyReviewContent {
  whatHappened: string;
  patternDetected: string;
  biggestWin: string;
  biggestRisk: string;
  focusNextWeek: string;
  /** Internal only — used for AI/planning, never shown in user UI */
  internalMetrics?: {
    momentumScore: number;
    executionRate7d: number;
  };
}

const REVIEW_SYSTEM_PROMPT = `You are MenAI's weekly review writer — an honest coach, not a cheerleader or analytics dashboard.

NEVER lead with metrics. NEVER open with "Execution rate", "Momentum score", or percentages.
NEVER celebrate milestones, plans, or initiatives that only exist as database records.
NEVER praise completing "Nutrition Plan Development" or similar auto-generated milestone titles unless TASKS COMPLETED THIS WEEK proves the user actually did that work.

If there are zero completed tasks AND zero reflections this week:
- Say plainly there is not enough execution data to identify meaningful progress.
- Do NOT invent wins. Leave biggestWin empty string "".
- focusNextWeek should ask for one completed task + one reflection.

If milestones completed but zero tasks completed — treat milestones as structural setup, NOT achievements.

Write as if speaking to someone who already knows their numbers. Focus on understanding, not reporting.
Cite initiative names, reflection language, and actual completed task titles — never generic praise.

Return JSON only:
{
  "whatHappened": "2-4 sentences. What they actually did — or honest admission if they didn't execute.",
  "patternDetected": "2-3 sentences. Pattern from behavior, or what's missing if no behavior logged.",
  "biggestWin": "1-2 sentences. Only if real execution evidence exists. Otherwise empty string.",
  "biggestRisk": "1-2 sentences. What will slow them down — including 'no execution data yet'.",
  "focusNextWeek": "2-3 sentences. One concrete thing to protect or start."
}`;

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

/** Map legacy cached reviews to the current shape. */
export function normalizeWeeklyReview(raw: Record<string, unknown>): WeeklyReviewContent {
  if (typeof raw.whatHappened === "string" && raw.whatHappened.trim()) {
    return {
      whatHappened: raw.whatHappened as string,
      patternDetected: (raw.patternDetected as string) || "",
      biggestWin: (raw.biggestWin as string) || "",
      biggestRisk: (raw.biggestRisk as string) || "",
      focusNextWeek: (raw.focusNextWeek as string) || "",
      internalMetrics: raw.internalMetrics as WeeklyReviewContent["internalMetrics"],
    };
  }

  const narrative = String(raw.narrative || "").trim();
  const executionSummary = String(raw.executionSummary || "").trim();
  const lifeArea = String(raw.lifeAreaDistribution || "").trim();

  return {
    whatHappened: narrative || lifeArea || executionSummary,
    patternDetected: "",
    biggestWin: String(raw.biggestWin || ""),
    biggestRisk: String(raw.biggestBottleneck || ""),
    focusNextWeek: String(raw.focusRecommendation || ""),
    internalMetrics:
      raw.momentumScore != null
        ? {
            momentumScore: Number(raw.momentumScore),
            executionRate7d: 0,
          }
        : undefined,
  };
}

export async function generateWeeklyReview(
  supabase: SupabaseClient,
  userId: string,
  forceRegenerate = false
): Promise<{ review: WeeklyReviewContent; weekStart: string; weekEnd: string; cached: boolean }> {
  const { weekStart, weekEnd } = weekBounds();

  const { data: existing } = await supabase
    .from("weekly_reviews")
    .select("content")
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .maybeSingle();

  if (existing?.content && !forceRegenerate) {
    return {
      review: normalizeWeeklyReview(existing.content as Record<string, unknown>),
      weekStart,
      weekEnd,
      cached: true,
    };
  }

  const quota = await checkAiQuota(userId, "weekly_review");
  if (!quota.allowed) {
    throw new Error(AI_UNAVAILABLE_MESSAGE);
  }

  const prevStart = new Date(weekStart);
  prevStart.setDate(prevStart.getDate() - 7);
  const prevWeekStart = prevStart.toISOString().split("T")[0];

  const [
    execution,
    momentum,
    tasksRes,
    initiativesRes,
    milestonesRes,
    goalsRes,
    patternsRes,
    commitmentsRes,
    signalsRes,
    profileRes,
    opportunitiesRes,
    reflectionsRes,
    prevReviewRes,
    timelineEvents,
  ] = await Promise.all([
    fetchExecutionMetrics(supabase, userId),
    computeMomentumScore(supabase, userId),
    supabase
      .from("tasks")
      .select("status, completed_at, due_date, title, auto_generated, initiatives(title, life_area)")
      .eq("user_id", userId)
      .gte("due_date", weekStart)
      .lte("due_date", weekEnd),
    supabase
      .from("initiatives")
      .select("id, title, description, life_area, target_date, last_action_at, progress, status")
      .eq("user_id", userId)
      .in("status", ["active", "completed"]),
    supabase
      .from("initiative_milestones")
      .select("title, status, completed_at, sort_order, initiative_id, initiatives(title, life_area)")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("goals")
      .select("title, description, category, status")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(8),
    supabase
      .from("execution_patterns")
      .select("pattern, trigger, behavioral_impact, severity, frequency")
      .eq("user_id", userId)
      .order("severity", { ascending: false })
      .limit(6),
    supabase
      .from("commitments")
      .select("description, category, status, consistency_score, timeframe")
      .eq("user_id", userId)
      .in("status", ["active", "pending"])
      .limit(10),
    supabase
      .from("identity_signals")
      .select("type, description, long_term_direction")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("profiles")
      .select("current_focus_initiative_id, current_focus_until, vision")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("opportunities")
      .select("title, urgency, status, due_date, life_area")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(8),
    supabase
      .from("daily_reflections")
      .select("moved_forward, blocked_by, tomorrow_context, reflection_date")
      .eq("user_id", userId)
      .gte("reflection_date", weekStart)
      .lte("reflection_date", weekEnd),
    supabase
      .from("weekly_reviews")
      .select("content")
      .eq("user_id", userId)
      .eq("week_start", prevWeekStart)
      .maybeSingle(),
    buildMemoryTimeline(supabase, userId, 24),
  ]);

  const tasks = tasksRes.data || [];
  const initiatives = initiativesRes.data || [];
  const milestones = milestonesRes.data || [];
  const goals = goalsRes.data || [];
  const patterns = patternsRes.data || [];
  const commitments = commitmentsRes.data || [];
  const signals = signalsRes.data || [];
  const profile = profileRes.data;
  const opportunities = opportunitiesRes.data || [];
  const reflections = reflectionsRes.data || [];

  const completedTasks = tasks.filter((t) => t.status === "completed");
  const missedTasks = tasks.filter((t) => t.status !== "completed" && t.status !== "in_progress");

  const focusInitiative = initiatives.find((i) => i.id === profile?.current_focus_initiative_id);

  const milestonesCompletedThisWeek = milestones.filter(
    (m) => m.status === "completed" && m.completed_at && m.completed_at.slice(0, 10) >= weekStart && m.completed_at.slice(0, 10) <= weekEnd
  );

  const weekTimeline = timelineEvents.filter(
    (e) => e.sortKey.slice(0, 10) >= weekStart && e.sortKey.slice(0, 10) <= weekEnd
  );

  const initiativeLines = initiatives.map((i) => {
    const h = computeInitiativeHealth({
      status: i.status,
      targetDate: i.target_date,
      lastActionAt: i.last_action_at,
      progress: i.progress,
    });
    const ms = milestones
      .filter((m) => m.initiative_id === i.id)
      .map((m) => `${m.title} (${m.status})`)
      .join("; ");
    return `- ${i.title} [${lifeAreaLabel(i.life_area)}]: ${h.label}. Target: ${i.target_date || "none"}. Milestones: ${ms || "none"}`;
  });

  const completedTaskLines = completedTasks.map((t) => {
    const init = (t.initiatives as { title?: string; life_area?: string } | null)?.title;
    return `- ${t.title}${init ? ` (${init})` : ""}`;
  });

  const missedTaskLines = missedTasks.slice(0, 8).map((t) => {
    const init = (t.initiatives as { title?: string } | null)?.title;
    return `- ${t.title}${init ? ` (${init})` : ""}`;
  });

  const reflectionBlock = reflections.length
    ? reflections
        .map(
          (r) =>
            `[${r.reflection_date}]\n  Moved forward: ${r.moved_forward}\n  Blocked by: ${r.blocked_by}\n  Tomorrow: ${r.tomorrow_context}`
        )
        .join("\n\n")
    : "No reflections logged this week.";

  const patternBlock = patterns.length
    ? patterns
        .map(
          (p) =>
            `- ${p.pattern}${p.frequency ? ` (${p.frequency})` : ""}: ${p.behavioral_impact || p.trigger || "detected in conversations"}`
        )
        .join("\n")
    : "No patterns recorded yet.";

  const commitmentBlock = commitments.length
    ? commitments.map((c) => `- ${c.description} (${c.category}, ${c.timeframe || "ongoing"})`).join("\n")
    : "No active commitments.";

  const directionBlock = [
    ...goals.map((g) => `- Goal: ${g.title}${g.description ? ` — ${g.description.slice(0, 80)}` : ""}`),
    ...signals
      .filter((s) => s.long_term_direction || s.description)
      .map((s) => `- Direction: ${s.long_term_direction || s.description}`),
    profile?.vision ? `- Vision: ${profile.vision}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const prevReview = prevReviewRes.data?.content as Record<string, unknown> | undefined;
  const prevNormalized = prevReview ? normalizeWeeklyReview(prevReview) : null;

  const hasExecutionEvidence =
    completedTasks.length > 0 || reflections.length > 0;

  const verifiedMilestones = milestonesCompletedThisWeek.filter((m) => {
    const init = initiatives.find((i) => i.id === m.initiative_id);
    const initTasks = completedTasks.filter(
      (t) => (t.initiatives as { title?: string } | null)?.title === init?.title
    );
    return initTasks.length > 0;
  });

  if (!hasExecutionEvidence && initiatives.length > 0) {
    const userModel = await getUserModel(supabase, userId);
    const initTitle = userModel.currentFocus.title || initiatives[0]?.title || "your initiative";
    const honest: WeeklyReviewContent = {
      whatHappened: `You're still in setup mode.

Most of this week went into defining direction and creating structure rather than producing execution data. That's normal early on.

The next step isn't building more structure — it's completing a few real tasks so patterns can start emerging.${initTitle ? ` Your current focus is "${initTitle}".` : ""}`,
      patternDetected:
        reflections.length === 0 && completedTasks.length === 0
          ? "Structure without execution — plans stay generic until tasks and reflections land."
          : "",
      biggestWin: "",
      biggestRisk:
        "Momentum won't show up in reviews until you finish at least one planned task and log what blocked you.",
      focusNextWeek:
        "Pick one task from your daily plan, finish it, and answer the three end-of-day questions. That's enough for better plans next week.",
      internalMetrics: {
        momentumScore: momentum.score,
        executionRate7d: execution.last7Days.rate,
      },
    };

    await supabase.from("weekly_reviews").upsert(
      {
        user_id: userId,
        week_start: weekStart,
        week_end: weekEnd,
        content: honest,
      },
      { onConflict: "user_id,week_start" }
    );

    return { review: honest, weekStart, weekEnd, cached: false };
  }

  const prompt = `Generate this user's weekly review for ${weekStart} to ${weekEnd}.

=== USER MODEL (authoritative — focus + active portfolio + execution allocation) ===
${formatUserModelForPrompt(await getUserModel(supabase, userId))}

=== LONG-TERM DIRECTION ===
${directionBlock || "Not defined yet."}

=== INITIATIVES ===
${initiativeLines.join("\n") || "No initiatives."}

=== CURRENT FOCUS ===
${focusInitiative ? `${focusInitiative.title} until ${profile?.current_focus_until || "unset"}` : "No explicit focus set."}

=== MILESTONES COMPLETED THIS WEEK (verify against tasks — do NOT praise if unverified) ===
${verifiedMilestones.map((m) => `- ${m.title} (user completed related tasks)`).join("\n") || "None with execution evidence."}
${
  milestonesCompletedThisWeek.length > verifiedMilestones.length
    ? `\nAuto-tracked only (NO task completions — do NOT celebrate): ${milestonesCompletedThisWeek
        .filter((m) => !verifiedMilestones.includes(m))
        .map((m) => m.title)
        .join(", ")}`
    : ""
}

=== TASKS COMPLETED THIS WEEK ===
${completedTaskLines.join("\n") || "None."}

=== TASKS NOT COMPLETED (planned this week) ===
${missedTaskLines.join("\n") || "None missed."}

=== DAILY REFLECTIONS (use their exact language) ===
${reflectionBlock}

=== EXECUTION PATTERNS ===
${patternBlock}

=== COMMITMENTS ===
${commitmentBlock}

=== ACTIVE OPPORTUNITIES ===
${opportunities.map((o) => `- ${o.title} (${o.urgency})`).join("\n") || "None."}

=== TIMELINE EVENTS THIS WEEK ===
${weekTimeline.map((e) => `- ${e.headline}`).join("\n") || "None."}

=== LAST WEEK'S REVIEW (for continuity, do not repeat verbatim) ===
${prevNormalized?.whatHappened || "No prior review."}

=== INTERNAL METRICS (for your reasoning only — do NOT quote these in output) ===
7-day execution rate: ${execution.last7Days.rate}% (${execution.last7Days.completed}/${execution.last7Days.total} planned tasks)
Momentum score: ${momentum.score}/100
Compare to last week if helpful internally — but never lead the review with these numbers.`;

  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: DEEP_MODEL,
    temperature: 0.45,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: REVIEW_SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty AI response");

  const usage = completion.usage;
  await logAiUsage(
    userId,
    "weekly_review",
    DEEP_MODEL,
    usage?.prompt_tokens ?? 0,
    usage?.completion_tokens ?? 0
  );

  const parsed = JSON.parse(raw) as Partial<WeeklyReviewContent>;

  const review: WeeklyReviewContent = {
    whatHappened: String(parsed.whatHappened || "").trim(),
    patternDetected: String(parsed.patternDetected || "").trim(),
    biggestWin: String(parsed.biggestWin || "").trim(),
    biggestRisk: String(parsed.biggestRisk || "").trim(),
    focusNextWeek: String(parsed.focusNextWeek || "").trim(),
    internalMetrics: {
      momentumScore: momentum.score,
      executionRate7d: execution.last7Days.rate,
    },
  };

  await supabase.from("weekly_reviews").upsert(
    {
      user_id: userId,
      week_start: weekStart,
      week_end: weekEnd,
      content: review,
    },
    { onConflict: "user_id,week_start" }
  );

  return { review, weekStart, weekEnd, cached: false };
}
