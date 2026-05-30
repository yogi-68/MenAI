import { getOpenAI } from "@/lib/ai/openai";
import {
  computePlanConfidence,
  type PlanConfidence,
  confidenceTier,
} from "@/lib/plans/plan-confidence";
import { computeInitiativeHealth } from "@/lib/plans/initiative-health";
import {
  computeLifeAreaBalance,
  formatBalanceInsight,
  lifeAreaLabel,
} from "@/lib/plans/life-areas";
import { fetchTimeEstimationProfile, adjustMinutesForUser } from "@/lib/plans/time-estimation";
import { fetchExecutionMetrics } from "@/lib/plans/execution-rate";
import { recordPlanGeneration } from "@/lib/plans/momentum-score";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PlanMode = "context_building" | "normal" | "aggressive";

export interface DailyPlanTask {
  title: string;
  whyItMatters: string;
  estimatedMinutes: number;
  deliverable: string;
  successMetric: string;
  isContextBuilding: boolean;
  lifeArea?: string;
  linkedInitiative?: string;
}

export interface DailyPlanContent {
  daySummary: string;
  whatMattersNow?: string;
  topObstacle?: string;
  whyTheseTasks: string;
  confidence: PlanConfidence;
  planMode: PlanMode;
  assumptions?: string[];
  lifeAreaInsight?: string;
  timeEstimationInsight?: string;
  executionRate7d?: number;
  tasks: DailyPlanTask[];
}

export interface PlanUserContext {
  initiatives: string[];
  initiativeHealth: string[];
  upcomingDeadlines: string[];
  opportunities: string[];
  recentReflections: string[];
  lifeAreaBalance: string[];
  goals: string[];
  commitments: string[];
  vision: string;
  currentPriorities: string[];
  unfinishedTasks: string[];
  recentProgress: string[];
  obstacles: string[];
  availableMinutes: number;
  energyLevel: string;
  identityContext: string;
  lifeContext: string;
  confidence: PlanConfidence;
  planMode: PlanMode;
  maxTasks: number;
  timeEstimationRatio: number;
  executionRate7d: number;
  initiativeMap: Map<string, string>;
  lifeAreaInsight?: string;
  timeEstimationInsight?: string;
}

const VAGUE_PATTERNS = [
  /^work on/i,
  /^make progress/i,
  /^improve /i,
  /^focus on/i,
  /^build (a |the )?business/i,
  /^build scalable/i,
  /^build recurring/i,
  /^study more/i,
  /^get healthier/i,
  /^network\b/i,
  /^network more/i,
  /cash flow$/i,
  /^continue /i,
  /^start working/i,
  /^work toward/i,
  /^spend time on/i,
  /^think about/i,
  /^plan for/i,
  /^research more/i,
  /^research investing/i,
  /^learn more about/i,
  /^improve career/i,
  /^goals?$/i,
];

export function isVagueTask(title: string): boolean {
  const normalized = title.trim();
  if (normalized.length < 12) return true;
  return VAGUE_PATTERNS.some((p) => p.test(normalized));
}

function listOrFallback(items: string[], fallback: string): string {
  return items.length > 0 ? items.map((i) => `  - ${i}`).join("\n") : `  - ${fallback}`;
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export async function fetchPlanUserContext(
  supabase: SupabaseClient,
  userId: string
): Promise<PlanUserContext> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const since = sevenDaysAgo.toISOString();
  const today = new Date().toISOString().split("T")[0];

  const [
    initiativesRes,
    goalsRes,
    pendingTasksRes,
    completedTasksRes,
    patternsRes,
    commitmentsRes,
    profileRes,
    signalsRes,
    onboardingRes,
    opportunitiesRes,
    balanceTasksRes,
    reflectionsRes,
    timeProfile,
    executionMetrics,
  ] = await Promise.all([
    supabase
      .from("initiatives")
      .select("id, title, description, target_date, progress, life_area, last_action_at, status, goals(title)")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("target_date", { ascending: true, nullsFirst: false })
      .limit(12),
    supabase
      .from("goals")
      .select("title, description, category, priority, progress, status, target_date")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("tasks")
      .select("title, status, due_date, estimated_minutes")
      .eq("user_id", userId)
      .in("status", ["pending", "in_progress"])
      .order("due_date", { ascending: true })
      .limit(20),
    supabase
      .from("tasks")
      .select("title, completed_at")
      .eq("user_id", userId)
      .eq("status", "completed")
      .gte("completed_at", since)
      .order("completed_at", { ascending: false })
      .limit(12),
    supabase
      .from("execution_patterns")
      .select("pattern, behavioral_impact, severity")
      .eq("user_id", userId)
      .order("severity", { ascending: false })
      .limit(6),
    supabase
      .from("commitments")
      .select("description, category, status, consistency_score")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(10),
    supabase
      .from("profiles")
      .select(
        "vision, daily_priorities, cognitive_state, founder_mode, work_style, lifestyle_issues, full_name"
      )
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("identity_signals")
      .select("type, description, long_term_direction")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("onboarding_responses")
      .select("question_id, response_text, response_data")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("opportunities")
      .select("title, description, urgency, due_date, life_area")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(8),
    supabase
      .from("tasks")
      .select("status, completed_at, due_date, initiatives(life_area)")
      .eq("user_id", userId)
      .gte("due_date", new Date(Date.now() - 14 * 86400000).toISOString().split("T")[0])
      .limit(100),
    supabase
      .from("daily_reflections")
      .select("moved_forward, blocked_by, tomorrow_context, reflection_date")
      .eq("user_id", userId)
      .order("reflection_date", { ascending: false })
      .limit(3),
    fetchTimeEstimationProfile(supabase, userId),
    fetchExecutionMetrics(supabase, userId),
  ]);

  const initiatives = initiativesRes.data || [];
  const goals = goalsRes.data || [];
  const pendingTasks = pendingTasksRes.data || [];
  const completedTasks = completedTasksRes.data || [];
  const patterns = patternsRes.data || [];
  const commitments = commitmentsRes.data || [];
  const profile = profileRes.data;
  const signals = signalsRes.data || [];
  const onboarding = onboardingRes.data || [];
  const opportunities = opportunitiesRes.data || [];
  const balanceTasks = balanceTasksRes.data || [];
  const recentReflectionsData = reflectionsRes.data || [];

  const recentReflectionLines = recentReflectionsData.map(
    (r) =>
      `[${r.reflection_date}] Moved: ${r.moved_forward} | Blocked: ${r.blocked_by} | Tomorrow needs: ${r.tomorrow_context}`
  );

  const initiativeMap = new Map<string, string>();
  for (const i of initiatives) {
    initiativeMap.set(i.title.toLowerCase(), i.id);
  }

  const initiativeHealthLines = initiatives.map((i) => {
    const health = computeInitiativeHealth({
      status: i.status,
      targetDate: i.target_date,
      lastActionAt: i.last_action_at,
      progress: i.progress,
    });
    return `${i.title} [${lifeAreaLabel(i.life_area)}] — ${health.label}: ${health.reason}`;
  });

  const initiativeLines = initiatives.map((i) => {
    const goalTitle = (i.goals as { title?: string } | null)?.title;
    const health = computeInitiativeHealth({
      status: i.status,
      targetDate: i.target_date,
      lastActionAt: i.last_action_at,
      progress: i.progress,
    });
    const parts = [`[${lifeAreaLabel(i.life_area)}]`, i.title, `(${health.label})`];
    if (i.description) parts.push(i.description);
    if (goalTitle) parts.push(`supports goal: ${goalTitle}`);
    if (i.target_date) {
      const days = daysUntil(i.target_date);
      parts.push(
        days >= 0 ? `deadline ${i.target_date}, ${days}d left` : `overdue since ${i.target_date}`
      );
    }
    if (i.progress) parts.push(`${i.progress}% done`);
    return parts.join(" — ");
  });

  const opportunityLines = opportunities.map((o) => {
    const parts = [`[${o.urgency} urgency]`, o.title];
    if (o.description) parts.push(o.description);
    if (o.due_date) parts.push(`due ${o.due_date}`);
    if (o.life_area) parts.push(`(${lifeAreaLabel(o.life_area)})`);
    return parts.join(" — ");
  });

  const balanceRows = balanceTasks.map((t) => ({
    life_area: (t.initiatives as { life_area?: string } | null)?.life_area || "personal",
    status: t.status,
    completed_at: t.completed_at,
    due_date: t.due_date,
  }));
  const lifeAreaBalance = computeLifeAreaBalance(balanceRows);
  const lifeAreaBalanceLines = lifeAreaBalance
    .filter((b) => b.plannedTasks > 0 || b.completedTasks > 0)
    .map(
      (b) =>
        `${b.label}: ${b.attentionPct}% attention, ${b.completedTasks}/${b.plannedTasks} completed${
          b.daysSinceAction !== null ? `, last action ${b.daysSinceAction}d ago` : ", no recent action"
        }`
    );
  const lifeAreaInsight = formatBalanceInsight(lifeAreaBalance);

  const upcomingDeadlines: string[] = [];
  for (const i of initiatives) {
    if (i.target_date && i.target_date >= today) {
      upcomingDeadlines.push(`${i.title} due ${i.target_date}`);
    }
  }
  for (const g of goals) {
    if (g.target_date && g.target_date >= today) {
      upcomingDeadlines.push(`${g.title} due ${g.target_date}`);
    }
  }

  const goalLines = goals.map((g) => {
    const parts = [g.title];
    if (g.description) parts.push(g.description);
    if (g.target_date) parts.push(`target ${g.target_date}`);
    if (g.progress) parts.push(`(${g.progress}% done)`);
    return parts.join(" — ");
  });

  const commitmentLines = commitments.map(
    (c) =>
      `${c.description}${c.category ? ` (${c.category})` : ""}${
        c.consistency_score != null ? ` — follow-through ${c.consistency_score}%` : ""
      }`
  );

  const unfinishedLines = pendingTasks.map((t) => {
    const due = t.due_date ? `, due ${t.due_date}` : "";
    return `${t.title}${due}`;
  });

  const recentProgressLines = completedTasks.map((t) => {
    const when = t.completed_at
      ? new Date(t.completed_at).toLocaleDateString()
      : "recently";
    return `Completed "${t.title}" on ${when}`;
  });

  const obstacleLines = patterns.map(
    (p) => `${p.pattern} (${p.severity}): ${p.behavioral_impact || "slows execution"}`
  );

  const cognitive = profile?.cognitive_state as Record<string, unknown> | null;
  const priorities = Array.isArray(profile?.daily_priorities)
    ? (profile.daily_priorities as string[])
    : [];

  const identityParts: string[] = [];
  if (signals.length > 0) {
    identityParts.push(
      ...signals.map((s) =>
        s.long_term_direction
          ? `${s.description} → ${s.long_term_direction}`
          : s.description
      )
    );
  }
  if (profile?.founder_mode) identityParts.push("Operating in founder/builder mode");
  if (profile?.work_style) identityParts.push(`Work style: ${profile.work_style}`);

  const lifeParts: string[] = [];
  if (profile?.lifestyle_issues) lifeParts.push(String(profile.lifestyle_issues));
  if (onboarding.length > 0) {
    lifeParts.push(
      ...onboarding
        .filter((r) => r.response_text)
        .slice(0, 4)
        .map((r) => r.response_text as string)
    );
  }
  if (cognitive?.dominant_patterns && Array.isArray(cognitive.dominant_patterns)) {
    lifeParts.push(`Patterns: ${(cognitive.dominant_patterns as string[]).join(", ")}`);
  }
  if (cognitive?.momentum) lifeParts.push(`Momentum: ${cognitive.momentum}`);
  if (cognitive?.energy_state) lifeParts.push(`Energy: ${cognitive.energy_state}`);

  let energyLevel = "moderate — standard capacity";
  if (cognitive?.energy_state) {
    energyLevel = String(cognitive.energy_state);
  } else if (cognitive?.momentum === "fragile but improving") {
    energyLevel = "low-moderate — keep tasks shorter and focused";
  }

  const confidence = computePlanConfidence({
    initiatives: initiatives.map((i) => ({
      title: i.title,
      targetDate: i.target_date,
    })),
    commitments: commitmentLines,
    goals: goalLines,
    unfinishedTasks: unfinishedLines,
    recentProgress: recentProgressLines,
    obstacles: obstacleLines,
    upcomingDeadlines,
    opportunities: opportunityLines.length,
  });

  const tier = confidenceTier(confidence.score);
  const planMode: PlanMode =
    tier === "low" ? "context_building" : tier === "high" ? "aggressive" : "normal";
  const maxTasks = tier === "low" ? 2 : tier === "high" ? 5 : 4;

  const baseMinutes = 480;
  const availableMinutes =
    planMode === "aggressive"
      ? Math.round(baseMinutes * (timeProfile.estimationRatio > 1.2 ? 0.85 : 1))
      : planMode === "context_building"
        ? Math.min(180, baseMinutes)
        : baseMinutes;

  return {
    initiatives: initiativeLines,
    initiativeHealth: initiativeHealthLines,
    upcomingDeadlines,
    opportunities: opportunityLines,
    recentReflections: recentReflectionLines,
    lifeAreaBalance: lifeAreaBalanceLines,
    goals: goalLines,
    commitments: commitmentLines,
    vision: profile?.vision || "Not set",
    currentPriorities:
      priorities.length > 0
        ? priorities
        : cognitive?.active_focus
          ? [String(cognitive.active_focus)]
          : [],
    unfinishedTasks: unfinishedLines,
    recentProgress: recentProgressLines,
    obstacles: obstacleLines,
    availableMinutes,
    energyLevel,
    identityContext:
      identityParts.length > 0 ? identityParts.join("; ") : "Limited identity data",
    lifeContext:
      lifeParts.length > 0 ? lifeParts.join("; ") : "Limited life context on file",
    confidence,
    planMode,
    maxTasks,
    timeEstimationRatio: timeProfile.estimationRatio,
    executionRate7d: executionMetrics.last7Days.rate,
    initiativeMap,
    lifeAreaInsight: lifeAreaInsight ?? undefined,
    timeEstimationInsight: timeProfile.insight ?? undefined,
  };
}

function buildPrompt(ctx: PlanUserContext): string {
  const availableHours = Math.round(ctx.availableMinutes / 60);
  const tier = confidenceTier(ctx.confidence.score);

  const modeInstructions =
    ctx.planMode === "context_building"
      ? `CONTEXT-BUILDING MODE (confidence ${ctx.confidence.score}%):
- Generate ONLY 1–2 context-building tasks
- Ask for missing information in whyTheseTasks (initiatives, deadlines, opportunities)
- Mark ALL tasks isContextBuilding: true
- Do NOT invent execution work from vague goals`
      : ctx.planMode === "aggressive"
        ? `AGGRESSIVE EXECUTION MODE (confidence ${ctx.confidence.score}%):
- Generate up to ${ctx.maxTasks} high-leverage tasks tied to initiatives and opportunities
- Prioritize at-risk and stalled initiatives
- Include at least one task that advances the highest-urgency opportunity if any exist
- Tasks should be ambitious but still concrete and measurable today`
        : `NORMAL MODE (confidence ${ctx.confidence.score}%):
- Generate up to ${ctx.maxTasks} tasks
- Include "assumptions" array listing 1–3 assumptions you made due to imperfect context
- Balance across life areas if one area dominates`;

  return `You are an elite execution coach and execution planner — not a goal tracker.

PRIMARY INPUT — Active initiatives (generate tasks mainly from these):
${listOrFallback(ctx.initiatives, "NONE — context is thin; prefer context-building tasks")}

Initiative health:
${listOrFallback(ctx.initiativeHealth, "No initiatives")}

Active opportunities (may outweigh routine tasks):
${listOrFallback(ctx.opportunities, "None logged — consider asking if anything time-sensitive this week")}

Daily reflections (use for context — explains low execution):
${listOrFallback(ctx.recentReflections, "None logged yet")}

Life area balance (last 14 days):
${listOrFallback(ctx.lifeAreaBalance, "No activity data yet")}
${ctx.lifeAreaInsight ? `\nBalance insight: ${ctx.lifeAreaInsight}` : ""}

Upcoming deadlines:
${listOrFallback(ctx.upcomingDeadlines, "None")}

Goals (background only — do NOT mirror as tasks):
${listOrFallback(ctx.goals, "None")}

Commitments:
${listOrFallback(ctx.commitments, "None")}

Vision: ${ctx.vision}

Unfinished tasks:
${listOrFallback(ctx.unfinishedTasks, "None")}

Recent progress (last 7 days):
${listOrFallback(ctx.recentProgress, "No completed tasks logged recently")}

Obstacles:
${listOrFallback(ctx.obstacles, "None detected")}

Execution rate (7-day planned tasks): ${ctx.executionRate7d}%
${ctx.timeEstimationInsight ? `Time estimation: ${ctx.timeEstimationInsight}` : ""}

Available time: ${availableHours} hours (${ctx.availableMinutes} minutes)
Energy: ${ctx.energyLevel}

PLAN CONFIDENCE: ${ctx.confidence.score}%
Gaps: ${ctx.confidence.gaps.join("; ") || "None"}
Strengths: ${ctx.confidence.strengths.join("; ") || "None"}

${modeInstructions}

CRITICAL: Generate tasks only when evidence shows highest-leverage action today.
Opportunities with critical/high urgency should beat routine maintenance.

Return JSON only:
{
  "whatMattersNow": "One sentence",
  "topObstacle": "One sentence",
  "daySummary": "One sentence",
  "whyTheseTasks": "2-4 sentences — coach voice, reference actual data",
  "assumptions": ["only in normal mode if needed"],
  "tasks": [{
    "title": "Concrete action",
    "whyItMatters": "One sentence",
    "estimatedMinutes": 60,
    "deliverable": "Exact output",
    "successMetric": "Measurable done criteria",
    "isContextBuilding": false,
    "lifeArea": "career|business|finance|health|learning|relationships|personal",
    "linkedInitiative": "initiative title if applicable"
  }]
}`;
}

function fitTasksToTimeBudget(
  tasks: DailyPlanTask[],
  maxMinutes: number,
  maxTasks: number
): DailyPlanTask[] {
  let total = 0;
  const fitted: DailyPlanTask[] = [];

  for (const task of tasks) {
    if (fitted.length >= maxTasks) break;
    if (total + task.estimatedMinutes > maxMinutes) continue;
    fitted.push(task);
    total += task.estimatedMinutes;
  }

  return fitted.length > 0 ? fitted : tasks.slice(0, Math.min(maxTasks, 3));
}

export async function generateDailyPlanWithAI(
  ctx: PlanUserContext
): Promise<DailyPlanContent> {
  const openai = getOpenAI();

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.35,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are an execution planner. Never invent vague tasks from broad goals. Explain your reasoning. JSON only.",
      },
      { role: "user", content: buildPrompt(ctx) },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty AI response");

  const parsed = JSON.parse(raw) as {
    whatMattersNow?: string;
    topObstacle?: string;
    daySummary?: string;
    whyTheseTasks?: string;
    assumptions?: string[];
    tasks?: Array<
      DailyPlanTask & { isContextBuilding?: boolean; linkedInitiative?: string }
    >;
  };

  const timeMode =
    ctx.planMode === "aggressive"
      ? "aggressive"
      : ctx.planMode === "context_building"
        ? "conservative"
        : "normal";

  let tasks: DailyPlanTask[] = (parsed.tasks || [])
    .filter((t) => t.title && (t.isContextBuilding || !isVagueTask(t.title)))
    .map((t) => ({
      title: t.title.trim(),
      whyItMatters:
        t.whyItMatters?.trim() ||
        "This is the highest-leverage move available today.",
      estimatedMinutes: adjustMinutesForUser(
        Math.min(180, Math.max(30, Number(t.estimatedMinutes) || 60)),
        ctx.timeEstimationRatio,
        timeMode
      ),
      deliverable: t.deliverable?.trim() || "Completed output ready to review",
      successMetric:
        t.successMetric?.trim() || "Done and verifiable with a clear yes/no",
      isContextBuilding: ctx.planMode === "context_building" || !!t.isContextBuilding,
      lifeArea: t.lifeArea,
      linkedInitiative: t.linkedInitiative?.trim(),
    }));

  if (ctx.planMode === "context_building") {
    tasks = tasks.filter((t) => t.isContextBuilding).slice(0, 2);
    if (tasks.length === 0 && (parsed.tasks || []).length > 0) {
      tasks = (parsed.tasks || []).slice(0, 2).map((t) => ({
        title: t.title.trim(),
        whyItMatters: t.whyItMatters?.trim() || "Build context before doing busy work.",
        estimatedMinutes: 45,
        deliverable: t.deliverable?.trim() || "Written output",
        successMetric: t.successMetric?.trim() || "Clear yes/no",
        isContextBuilding: true,
        lifeArea: t.lifeArea,
        linkedInitiative: t.linkedInitiative,
      }));
    }
  }

  tasks = fitTasksToTimeBudget(tasks, ctx.availableMinutes, ctx.maxTasks);

  if (tasks.length === 0) {
    throw new Error("AI produced only vague or oversized tasks");
  }

  return {
    whatMattersNow: parsed.whatMattersNow?.trim(),
    topObstacle: parsed.topObstacle?.trim(),
    whyTheseTasks:
      parsed.whyTheseTasks?.trim() ||
      (ctx.planMode === "context_building"
        ? "Your context is still thin. Today focuses on getting clearer — add initiatives, deadlines, or log any time-sensitive opportunities."
        : "These tasks target your active initiatives and the biggest gap between where you are and your next deadline."),
    daySummary:
      parsed.daySummary?.trim() ||
      "Today is about specific actions that move your initiatives forward.",
    confidence: ctx.confidence,
    planMode: ctx.planMode,
    assumptions: parsed.assumptions?.filter(Boolean).slice(0, 3),
    lifeAreaInsight: ctx.lifeAreaInsight,
    timeEstimationInsight: ctx.timeEstimationInsight ?? undefined,
    executionRate7d: ctx.executionRate7d,
    tasks,
  };
}

export async function invalidateTodayPlan(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const today = new Date().toISOString().split("T")[0];
  await supabase
    .from("daily_plans")
    .delete()
    .eq("user_id", userId)
    .eq("plan_date", today);
}

export async function ensureTodayPlan(
  supabase: SupabaseClient,
  userId: string
): Promise<{ plan: DailyPlanContent; planId: string; created: boolean }> {
  const today = new Date().toISOString().split("T")[0];

  const { data: existing } = await supabase
    .from("daily_plans")
    .select("id, plan_content")
    .eq("user_id", userId)
    .eq("plan_date", today)
    .maybeSingle();

  if (existing?.plan_content) {
    const content = normalizePlanContent(existing.plan_content);
    const stale =
      content.tasks.some((t) => isVagueTask(t.title)) ||
      content.tasks.some((t) => !t.deliverable || !t.successMetric) ||
      !content.whyTheseTasks ||
      !content.confidence ||
      !content.planMode;

    if (!stale && content.tasks.length > 0) {
      return { plan: content, planId: existing.id, created: false };
    }

    await supabase.from("daily_plans").delete().eq("id", existing.id);
  }

  const ctx = await fetchPlanUserContext(supabase, userId);
  const planContent = await generateDailyPlanWithAI(ctx);

  const { data: inserted, error } = await supabase
    .from("daily_plans")
    .insert({
      user_id: userId,
      plan_date: today,
      plan_content: planContent,
      ai_notes: planContent.daySummary,
    })
    .select("id")
    .single();

  if (error) throw error;

  await recordPlanGeneration(supabase, userId, today);

  const { data: existingTodayTasks } = await supabase
    .from("tasks")
    .select("title")
    .eq("user_id", userId)
    .eq("due_date", today);

  const existingTitles = new Set(
    (existingTodayTasks || []).map((t) => t.title.toLowerCase())
  );

  const newTasks = planContent.tasks
    .filter((t) => !existingTitles.has(t.title.toLowerCase()))
    .map((t) => {
      const initiativeId = t.linkedInitiative
        ? ctx.initiativeMap.get(t.linkedInitiative.toLowerCase())
        : undefined;
      return {
        user_id: userId,
        title: t.title,
        description: `${t.whyItMatters}\n\nDeliverable: ${t.deliverable}\nSuccess: ${t.successMetric}`,
        status: "pending",
        due_date: today,
        estimated_minutes: t.estimatedMinutes,
        initiative_id: initiativeId || null,
        auto_generated: true,
        generation_reason: t.isContextBuilding ? "context_building" : "daily_plan",
      };
    });

  if (newTasks.length > 0) {
    await supabase.from("tasks").insert(newTasks);
  }

  return { plan: planContent, planId: inserted.id, created: true };
}

function normalizePlanContent(raw: unknown): DailyPlanContent {
  const content = raw as Record<string, unknown>;

  const tasks = ((content.tasks as DailyPlanTask[]) || []).map((t) => {
    const legacy = t as DailyPlanTask & { reason?: string };
    return {
      title: legacy.title,
      whyItMatters: legacy.whyItMatters || legacy.reason || "",
      estimatedMinutes: legacy.estimatedMinutes || 60,
      deliverable: legacy.deliverable || "",
      successMetric: legacy.successMetric || "",
      isContextBuilding: legacy.isContextBuilding ?? false,
    };
  });

  return {
    whatMattersNow: content.whatMattersNow as string | undefined,
    topObstacle: content.topObstacle as string | undefined,
    whyTheseTasks: String(content.whyTheseTasks || ""),
    daySummary: String(content.daySummary || content.aiNotes || ""),
    confidence: (content.confidence as PlanConfidence) || {
      score: 0,
      gaps: ["Plan generated before confidence scoring"],
      strengths: [],
    },
    planMode: (content.planMode as PlanMode) || "normal",
    assumptions: content.assumptions as string[] | undefined,
    lifeAreaInsight: content.lifeAreaInsight as string | undefined,
    timeEstimationInsight: content.timeEstimationInsight as string | undefined,
    executionRate7d: content.executionRate7d as number | undefined,
    tasks,
  };
}
