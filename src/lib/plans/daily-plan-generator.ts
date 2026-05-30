import { getOpenAI } from "@/lib/ai/openai";
import { FAST_MODEL } from "@/lib/ai/models";
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
import { logAiUsage, checkAiQuota, AI_UNAVAILABLE_MESSAGE } from "@/lib/ai/usage-guard";
import {
  applyPlanLanguageGuard,
  buildPlanEvidence,
  isLowPlanConfidence,
} from "@/lib/plans/language-guard";
import { trackProductEventOnce } from "@/lib/analytics/track-event";
import { buildPatternGuidanceLines } from "@/lib/plans/pattern-task-guidance";
import { TASK_QUALITY_PROMPT, passesTaskQualityGate } from "@/lib/plans/task-quality";
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
  evidence?: string[];
  tasks: DailyPlanTask[];
}

export type PlanPhase = "morning" | "afternoon" | "night";

export interface FetchPlanOptions {
  middayCompleted?: string[];
  planPhase?: PlanPhase;
}

export interface PlanUserContext {
  initiatives: string[];
  initiativeHealth: string[];
  initiativeMilestones: string[];
  upcomingDeadlines: string[];
  opportunities: string[];
  urgentOpportunities: string[];
  recentReflections: string[];
  lifeAreaBalance: string[];
  goals: string[];
  commitments: string[];
  vision: string;
  currentPriorities: string[];
  currentFocus: string | null;
  currentFocusUntil: string | null;
  unfinishedTasks: string[];
  recentProgress: string[];
  obstacles: string[];
  patternGuidance: string[];
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
  planPhase: PlanPhase;
  middayCompleted: string[];
}

import { isVagueTask, isFinishableTodayTask } from "@/lib/tasks/finishable-today";

export { isVagueTask } from "@/lib/tasks/finishable-today";

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

function currentPlanPhase(): PlanPhase {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "night";
}

export async function fetchPlanUserContext(
  supabase: SupabaseClient,
  userId: string,
  options: FetchPlanOptions = {}
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
        "vision, daily_priorities, cognitive_state, founder_mode, work_style, lifestyle_issues, full_name, current_focus_initiative_id, current_focus_until"
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

  const initiativeIds = (initiativesRes.data || []).map((i) => i.id);
  const { data: milestonesData } =
    initiativeIds.length > 0
      ? await supabase
          .from("initiative_milestones")
          .select("initiative_id, title, status, sort_order, initiatives(title)")
          .eq("user_id", userId)
          .in("initiative_id", initiativeIds)
          .order("sort_order", { ascending: true })
      : { data: [] as Array<{ initiative_id: string; title: string; status: string; sort_order: number; initiatives: { title?: string } | null }> };

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

  const urgentOpportunityLines = opportunities
    .filter((o) => {
      if (o.urgency === "critical" || o.urgency === "high") return true;
      if (o.due_date) {
        const days = daysUntil(o.due_date);
        return days >= 0 && days <= 2;
      }
      return false;
    })
    .map((o) => {
      const due = o.due_date ? ` (due ${o.due_date})` : "";
      return `[URGENT — beats routine plans] ${o.title} — ${o.urgency} urgency${due}`;
    });

  const milestoneLines = (milestonesData || []).map((m) => {
    const initTitle = (m.initiatives as { title?: string } | null)?.title || "Initiative";
    const status =
      m.status === "completed" ? "done" : m.status === "in_progress" ? "CURRENT" : "upcoming";
    return `${initTitle}: [${status}] ${m.title}`;
  });

  let currentFocusTitle: string | null = null;
  let currentFocusUntil: string | null = profileRes.data?.current_focus_until ?? null;
  const focusId = profileRes.data?.current_focus_initiative_id;
  if (focusId) {
    const focusInit = initiatives.find((i) => i.id === focusId);
    if (focusInit) currentFocusTitle = focusInit.title;
  }

  const patternGuidance = buildPatternGuidanceLines(patterns);

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
  if (profile?.founder_mode && initiatives.some((i) => i.life_area === "business")) {
    identityParts.push("Operating in founder/builder mode");
  }
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

  const planPhase = options.planPhase ?? currentPlanPhase();
  const middayCompleted = options.middayCompleted ?? [];
  let availableMinutesAdjusted = availableMinutes;
  if (planPhase === "afternoon" && middayCompleted.length > 0) {
    availableMinutesAdjusted = Math.max(90, Math.round(availableMinutes * 0.55));
  }

  return {
    initiatives: initiativeLines,
    initiativeHealth: initiativeHealthLines,
    initiativeMilestones: milestoneLines,
    upcomingDeadlines,
    opportunities: opportunityLines,
    urgentOpportunities: urgentOpportunityLines,
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
    currentFocus: currentFocusTitle,
    currentFocusUntil,
    unfinishedTasks: unfinishedLines,
    recentProgress: recentProgressLines,
    obstacles: obstacleLines,
    patternGuidance,
    availableMinutes: availableMinutesAdjusted,
    energyLevel,
    identityContext:
      identityParts.length > 0 ? identityParts.join("; ") : "Limited identity data",
    lifeContext:
      lifeParts.length > 0 ? lifeParts.join("; ") : "Limited life context on file",
    confidence,
    planMode,
    maxTasks: planPhase === "afternoon" && middayCompleted.length > 0 ? Math.min(maxTasks, 3) : maxTasks,
    timeEstimationRatio: timeProfile.estimationRatio,
    executionRate7d: executionMetrics.last7Days.rate,
    initiativeMap,
    lifeAreaInsight: lifeAreaInsight ?? undefined,
    timeEstimationInsight: timeProfile.insight ?? undefined,
    planPhase,
    middayCompleted,
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

PRIORITY STACK (strict — higher beats lower):
1. URGENT OPPORTUNITIES — time-sensitive events (interviews, deadlines, crises) override everything
2. CURRENT FOCUS initiative milestone — one active focus only; secondary initiatives get zero tasks unless opportunity demands
3. Other initiative milestones (in_progress milestone only)
4. Routine / maintenance tasks last

CURRENT FOCUS (only one — everything else is secondary):
${ctx.currentFocus ? `  - ${ctx.currentFocus}${ctx.currentFocusUntil ? ` until ${ctx.currentFocusUntil}` : ""}` : "  - Not set — spread tasks across initiatives or ask user to pick focus"}

Plan phase: ${ctx.planPhase}${ctx.middayCompleted.length > 0 ? `\nAlready completed this morning:\n${ctx.middayCompleted.map((t) => `  - ${t}`).join("\n")}\nGenerate ONLY remaining afternoon tasks.` : ""}

URGENT OPPORTUNITIES (override routine plans — rearrange day around these):
${listOrFallback(ctx.urgentOpportunities, "None — proceed with initiative milestones")}

Initiative milestones (generate tasks from CURRENT / in_progress milestone — not vague initiative titles):
${listOrFallback(ctx.initiativeMilestones, "No milestones yet — suggest 1 context-building task to define milestones")}

PRIMARY INPUT — Active initiatives:
${listOrFallback(ctx.initiatives, "NONE — context is thin; prefer context-building tasks")}

Initiative health (narrative — use these labels in whyItMatters, not percentages):
${listOrFallback(ctx.initiativeHealth, "No initiatives")}

All opportunities:
${listOrFallback(ctx.opportunities, "None logged — consider asking if anything time-sensitive this week")}

Execution patterns → task design (MUST follow — generate tasks that counter weaknesses):
${listOrFallback(ctx.patternGuidance, "No patterns detected yet")}

Daily reflections (use for context — explains low execution):
${listOrFallback(ctx.recentReflections, "None logged yet")}

Life area balance (last 14 days):
${listOrFallback(ctx.lifeAreaBalance, "No activity data yet")}
${ctx.lifeAreaInsight ? `\nBalance insight: ${ctx.lifeAreaInsight}` : ""}

Upcoming deadlines:
${listOrFallback(ctx.upcomingDeadlines, "None")}

Goals (background DIRECTION only — never generate tasks from these):
${listOrFallback(ctx.goals, "None")}

TASK RULE — every task MUST pass: "Can the user finish this today before bed?"
DOMAIN RULE — match task language to initiative life areas:
- health → nutrition, training, walks — NEVER SaaS/customer/outreach tasks
- learning → study blocks, syllabus, mocks — NEVER startup/MVP/customer tasks
- career → applications, prep, networking for jobs — not product launch tasks
- business → only area where outreach/MVP/customer tasks are appropriate
BAD: "Build scalable businesses", "Increase income", "Improve fitness", "Research competitors" (when overthinking pattern detected)
GOOD: "Send 5 outreach emails" (business only), "Walk 30 minutes" (health), "Complete 2 UPSC chapters" (learning)
Each task needs a deliverable + successMetric that is yes/no verifiable today.

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

LANGUAGE RULES (confidence ${ctx.confidence.score}%):
${
  isLowPlanConfidence(ctx.confidence.score)
    ? `- LOW CONTEXT: Use hedged language only. Start summaries with "Based on the information available..." or "Your current goals suggest..."
- NEVER state conclusions as facts (avoid "You're focused on X", "Your priority is X")
- whyTheseTasks MUST cite specific gaps from the Gaps list above
- Include "evidenceUsed" array listing each data point you relied on`
    : `- Medium/high context: be direct but still cite initiatives, deadlines, or execution rate when making claims
- Include "evidenceUsed" array listing each data point you relied on`
}

CRITICAL: Generate tasks only when evidence shows highest-leverage action today.
Urgent opportunities ALWAYS beat routine initiative tasks.
Tasks must advance the current in_progress milestone — never repeat generic work.
Each task whyItMatters MUST answer "Why this task?" with user-specific evidence (e.g. "You've delayed outreach for 5 days. This unblocks that.").

${TASK_QUALITY_PROMPT}

Return JSON only:
{
  "whatMattersNow": "One sentence",
  "topObstacle": "One sentence",
  "daySummary": "One sentence",
  "whyTheseTasks": "2-4 sentences — coach voice, reference actual data",
  "evidenceUsed": ["data point 1", "data point 2"],
  "assumptions": ["only in normal mode if needed"],
  "tasks": [{
    "title": "Concrete action",
    "whyItMatters": "Why this task? — cite pattern, delay, milestone, or opportunity",
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
  ctx: PlanUserContext,
  userId?: string
): Promise<DailyPlanContent> {
  const openai = getOpenAI();

  const completion = await openai.chat.completions.create({
    model: FAST_MODEL,
    temperature: 0.35,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are an execution planner. Never invent vague or generic tasks. Every task must be one concrete action finishable today tied to a milestone. Reject research/planning tasks when overthinking is detected. JSON only.",
      },
      { role: "user", content: buildPrompt(ctx) },
    ],
  });

  if (userId) {
    logAiUsage(
      userId,
      "daily_plan",
      FAST_MODEL,
      completion.usage?.prompt_tokens ?? 0,
      completion.usage?.completion_tokens ?? 0
    ).catch(() => {});
  }

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty AI response");

  const parsed = JSON.parse(raw) as {
    whatMattersNow?: string;
    topObstacle?: string;
    daySummary?: string;
    whyTheseTasks?: string;
    assumptions?: string[];
    evidenceUsed?: string[];
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
    .filter((t) => t.title && (t.isContextBuilding || passesTaskQualityGate(t.title)))
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

  const score = ctx.confidence.score;
  const evidence =
    (parsed.evidenceUsed?.filter(Boolean).length ?? 0) > 0
      ? parsed.evidenceUsed!.filter(Boolean).slice(0, 6)
      : buildPlanEvidence(ctx);

  return {
    whatMattersNow: applyPlanLanguageGuard(parsed.whatMattersNow?.trim(), score),
    topObstacle: applyPlanLanguageGuard(parsed.topObstacle?.trim(), score),
    whyTheseTasks:
      applyPlanLanguageGuard(
        parsed.whyTheseTasks?.trim() ||
          (ctx.planMode === "context_building"
            ? "Based on the information available, your context is still thin. Today focuses on getting clearer — add initiatives, deadlines, or log any time-sensitive opportunities."
            : "These tasks target your active initiatives and the biggest gap between where you are and your next deadline."),
        score
      ) || "",
    daySummary:
      applyPlanLanguageGuard(
        parsed.daySummary?.trim() ||
          "Today is about specific actions that move your initiatives forward.",
        score
      ) || "",
    confidence: ctx.confidence,
    planMode: ctx.planMode,
    assumptions: parsed.assumptions?.filter(Boolean).slice(0, 3),
    lifeAreaInsight: ctx.lifeAreaInsight,
    timeEstimationInsight: ctx.timeEstimationInsight ?? undefined,
    executionRate7d: ctx.executionRate7d,
    evidence,
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

export function buildEmptyPlan(): DailyPlanContent {
  return {
    daySummary: "Add an active initiative to generate today's tasks.",
    whatMattersNow: undefined,
    whyTheseTasks: "",
    confidence: {
      score: 15,
      gaps: ["No active initiatives"],
      strengths: [],
    },
    planMode: "context_building",
    tasks: [],
    evidence: ["No active initiatives"],
  };
}

export async function ensureTodayPlan(
  supabase: SupabaseClient,
  userId: string
): Promise<{ plan: DailyPlanContent; planId: string; created: boolean }> {
  const today = new Date().toISOString().split("T")[0];

  const { count: initiativeCount } = await supabase
    .from("initiatives")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "active");

  if ((initiativeCount ?? 0) === 0) {
    await invalidateTodayPlan(supabase, userId);
    const empty = buildEmptyPlan();
    const { data: inserted, error } = await supabase
      .from("daily_plans")
      .insert({
        user_id: userId,
        plan_date: today,
        plan_content: empty,
        ai_notes: empty.daySummary,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { plan: empty, planId: inserted.id, created: false };
  }

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

  const quota = await checkAiQuota(userId, "daily_plan");
  if (!quota.allowed) {
    throw new Error(AI_UNAVAILABLE_MESSAGE);
  }

  const planContent = await generateDailyPlanWithAI(ctx, userId);

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
  trackProductEventOnce(userId, "first_plan_generated").catch(() => {});

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

/** Midday replan: keep morning wins, regenerate afternoon tasks. */
export async function adjustMiddayPlan(
  supabase: SupabaseClient,
  userId: string,
  completedTitles: string[]
): Promise<{ plan: DailyPlanContent; planId: string }> {
  const today = new Date().toISOString().split("T")[0];

  const { data: existing } = await supabase
    .from("daily_plans")
    .select("id, plan_content")
    .eq("user_id", userId)
    .eq("plan_date", today)
    .maybeSingle();

  const prior = existing?.plan_content
    ? normalizePlanContent(existing.plan_content)
    : null;

  const ctx = await fetchPlanUserContext(supabase, userId, {
    middayCompleted: completedTitles,
    planPhase: "afternoon",
  });

  const quota = await checkAiQuota(userId, "daily_plan");
  if (!quota.allowed) throw new Error(AI_UNAVAILABLE_MESSAGE);

  const afternoonPlan = await generateDailyPlanWithAI(ctx, userId);

  const completedSet = new Set(completedTitles.map((t) => t.toLowerCase()));
  const morningTasks = (prior?.tasks || []).filter((t) =>
    completedSet.has(t.title.toLowerCase())
  );
  const mergedTasks = [...morningTasks, ...afternoonPlan.tasks];

  const planContent: DailyPlanContent = {
    ...afternoonPlan,
    daySummary: `Morning: ${completedTitles.length} done. Afternoon: ${afternoonPlan.daySummary}`,
    whyTheseTasks: `You completed ${completedTitles.length} task(s) this morning. ${afternoonPlan.whyTheseTasks}`,
    tasks: mergedTasks,
  };

  let planId = existing?.id;
  if (planId) {
    await supabase
      .from("daily_plans")
      .update({ plan_content: planContent, ai_notes: planContent.daySummary })
      .eq("id", planId);
  } else {
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
    planId = inserted.id;
  }

  const { data: existingTodayTasks } = await supabase
    .from("tasks")
    .select("title")
    .eq("user_id", userId)
    .eq("due_date", today);

  const existingTitles = new Set(
    (existingTodayTasks || []).map((t) => t.title.toLowerCase())
  );

  const newTasks = afternoonPlan.tasks
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
        generation_reason: "midday_adjust",
      };
    });

  if (newTasks.length > 0) {
    await supabase.from("tasks").insert(newTasks);
  }

  return { plan: planContent, planId: planId! };
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
    evidence: (content.evidence as string[]) || [],
    tasks,
  };
}
