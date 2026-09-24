"use client";

import Link from "next/link";
import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Clock, Target, Sparkles } from "lucide-react";
import { TaskCheckButton } from "@/components/plans/task-check-button";
import { SetupChecklist } from "@/components/onboarding/setup-checklist";
import { PlanContextInterview } from "@/components/plans/plan-context-interview";
import { GoalCompletionRingRow } from "@/components/charts/daily-completion-ring";
import { ClayCard } from "@/components/ui";
import { isLowPlanConfidence } from "@/lib/plans/language-guard";
import { goalAccent } from "@/lib/goals/goal-colors";
import { buildTaskWhyLine } from "@/lib/plans/task-why-line";

interface DailyPlanContent {
  daySummary: string;
  whatMattersNow?: string;
  topObstacle?: string;
  whyTheseTasks?: string;
  planMode?: "context_building" | "normal" | "aggressive";
  assumptions?: string[];
  lifeAreaInsight?: string;
  timeEstimationInsight?: string;
  executionRate7d?: number;
  confidence?: {
    score: number;
    gaps: string[];
    strengths: string[];
  };
    planningContext?: {
    planningQuality: "Strong" | "Good" | "Fair" | "Needs context";
    dimensions: Array<{ id: string; label: string; satisfied: boolean; gapHint?: string }>;
    improvementHints: string[];
    coachInsight?: string;
    missingLabels?: string[];
    daysRemaining?: number | null;
  };
  evidence?: string[];
  tasks: DailyPlanTask[];
  calibrationQuestion?: string;
}

interface DailyPlanTask {
  title: string;
  whyItMatters: string;
  estimatedMinutes: number;
  deliverable: string;
  successMetric: string;
  isContextBuilding: boolean;
  linkedInitiative?: string;
  linkedMilestone?: string;
  /** DB task ID embedded at plan-gen time for direct matching */
  taskId?: string;
}

interface Task {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  description: string | null;
  estimated_minutes: number | null;
  actual_minutes: number | null;
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function DailyPlansPage() {
  const queryClient = useQueryClient();
  const todayKey = new Date().toISOString().split("T")[0];
  const [timePromptTask, setTimePromptTask] = useState<{ id: string; estimated: number } | null>(null);
  const [actualMinutesInput, setActualMinutesInput] = useState("");
  const [adjusting, setAdjusting] = useState(false);

  const hour = new Date().getHours();
  const planPhase = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "night";

  const { data: rhythm } = useQuery({
    queryKey: ["rhythm"],
    queryFn: async () => {
      const res = await fetch("/api/rhythm");
      if (!res.ok) return null;
      return res.json() as Promise<{ phase: string; focus_prompt: string; suggested_action: string; greeting: string }>;
    },
    staleTime: 60_000,
  });

  const adjustPlan = useMutation({
    mutationFn: async (completedTitles: string[]) => {
      const res = await fetch("/api/plans/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completedTitles }),
      });
      if (!res.ok) throw new Error("Adjust failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["daily-plan"] });
      queryClient.invalidateQueries({ queryKey: ["today-tasks"] });
      setAdjusting(false);
    },
  });

  const { data: planData, isLoading: planLoading } = useQuery({
    queryKey: ["daily-plan", todayKey],
    queryFn: async () => {
      const res = await fetch("/api/plans/generate");
      if (!res.ok) throw new Error("Failed to load plan");
      return res.json() as Promise<{ plan: DailyPlanContent; created: boolean }>;
    },
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const { data: tasks, isLoading: tasksLoading } = useQuery({
    queryKey: ["today-tasks", todayKey],
    queryFn: async () => {
      const res = await fetch(`/api/tasks?dueDate=today&status=all`);
      if (!res.ok) return [];
      const json = await res.json();
      return (json.tasks || []) as Task[];
    },
    staleTime: 15_000,
  });

  const { data: executionData } = useQuery({
    queryKey: ["execution-metrics"],
    queryFn: async () => {
      const res = await fetch("/api/execution");
      if (!res.ok) throw new Error("Failed to load metrics");
      return res.json();
    },
    staleTime: 60_000,
  });

  const { data: goalsPayload } = useQuery({
    queryKey: ["execution-goals"],
    queryFn: async () => {
      const res = await fetch("/api/goals?goal_kind=execution&status=active");
      if (!res.ok) return { goals: [] as { id: string; title: string }[] };
      return res.json() as Promise<{ goals: { id: string; title: string }[] }>;
    },
    staleTime: 60_000,
  });

  const { data: userModelData } = useQuery({
    queryKey: ["user-model-confidence"],
    queryFn: async () => {
      const res = await fetch("/api/user-model");
      if (!res.ok) return null;
      return res.json() as Promise<{ goalConfidence?: Record<string, { total: number }> }>;
    },
    staleTime: 5 * 60_000,
  });

  const { data: briefingData } = useQuery({
    queryKey: ["dashboard-today-briefing", todayKey],
    queryFn: async () => {
      const res = await fetch("/api/dashboard/today");
      if (!res.ok) return null;
      return res.json() as Promise<{
        personalBriefing?: {
          headline: string;
          companionLine: string | null;
          todaysFocus: string | null;
          watchOut: string | null;
          progressLine: string | null;
        };
      }>;
    },
    staleTime: 60_000,
  });

  const completeTask = useMutation({
    mutationFn: async ({ id, actualMinutes }: { id: string; actualMinutes?: number }) => {
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          status: "completed",
          ...(actualMinutes ? { actualMinutes } : {}),
        }),
      });
      return res.json();
    },
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: ["today-tasks", todayKey] });
      const previous = queryClient.getQueryData<Task[]>(["today-tasks", todayKey]);
      queryClient.setQueryData<Task[]>(["today-tasks", todayKey], (old) =>
        (old || []).map((t) => (t.id === id ? { ...t, status: "completed" } : t))
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["today-tasks", todayKey], context.previous);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["today-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["execution-metrics"] });
      queryClient.invalidateQueries({ queryKey: ["performance-daily"] });
      queryClient.invalidateQueries({ queryKey: ["daily-plan"] });
      setTimePromptTask(null);
      setActualMinutesInput("");
    },
  });

  const toggleTask = useMutation({
    mutationFn: async ({ id, status, estimated }: { id: string; status: string; estimated?: number }) => {
      if (status !== "completed") {
        setTimePromptTask({ id, estimated: estimated || 60 });
        return null;
      }
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "pending" }),
      });
      return res.json();
    },
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: ["today-tasks", todayKey] });
      const previous = queryClient.getQueryData<Task[]>(["today-tasks", todayKey]);
      queryClient.setQueryData<Task[]>(["today-tasks", todayKey], (old) =>
        (old || []).map((t) => (t.id === id ? { ...t, status: "pending" } : t))
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["today-tasks", todayKey], context.previous);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["today-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["execution-metrics"] });
      queryClient.invalidateQueries({ queryKey: ["performance-daily"] });
    },
  });

  const plan = planData?.plan;
  const coachInsight = plan?.planningContext?.coachInsight;
  const topPriority =
    coachInsight ||
    plan?.whatMattersNow ||
    plan?.daySummary;
  const _metrics = executionData?.metrics;
  const completedTasks = tasks?.filter((t) => t.status === "completed").length || 0;
  const totalTasks = tasks?.length || 0;
  const _completionRate =
    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const isLoading = planLoading || tasksLoading;
  const _lowContext = plan?.confidence ? isLowPlanConfidence(plan.confidence.score) : false;
  const _planningQuality = plan?.planningContext?.planningQuality;
  const evidence = plan?.evidence || [];
  const hasGoals =
    (goalsPayload?.goals?.length ?? 0) > 0 &&
    !evidence.some((e) => /No active goals|No active initiatives/i.test(e));
  const showSetup = !hasGoals;

  const briefingBullets = [
    briefingData?.personalBriefing?.todaysFocus,
    briefingData?.personalBriefing?.watchOut,
    briefingData?.personalBriefing?.progressLine,
    briefingData?.personalBriefing?.companionLine,
  ].filter(Boolean) as string[];

  const genericWhy =
    plan?.whyTheseTasks &&
    /these tasks align|designed to move|focus on what matters|stay on track|help you progress/i.test(
      plan.whyTheseTasks
    );

  const tasksByGoal = useMemo(() => {
    const groups = new Map<string, DailyPlanTask[]>();
    for (const t of plan?.tasks ?? []) {
      const key = t.linkedInitiative?.trim() || "Focus";
      const list = groups.get(key) ?? [];
      list.push(t);
      groups.set(key, list);
    }
    return [...groups.entries()];
  }, [plan?.tasks]);

  const taskById = useMemo(
    () => new Map((tasks || []).map((t) => [t.id, t])),
    [tasks]
  );
  const taskByTitle = useMemo(
    () => new Map((tasks || []).map((t) => [t.title.toLowerCase().trim(), t])),
    [tasks]
  );
  // Prefer DB ID match, fall back to normalized title lookup
  function resolveDbTask(planTask: DailyPlanTask): Task | undefined {
    if (planTask.taskId) return taskById.get(planTask.taskId);
    return taskByTitle.get(planTask.title.toLowerCase().trim());
  }

  const goalTitleToId = useMemo(
    () => new Map((goalsPayload?.goals ?? []).map((g) => [g.title.toLowerCase(), g.id])),
    [goalsPayload?.goals]
  );

  const goalRings = useMemo(() => {
    return tasksByGoal.map(([goalTitle, goalTasks], goalIndex) => {
      const completed = goalTasks.filter((pt) => {
        const db = pt.taskId ? taskById.get(pt.taskId) : taskByTitle.get(pt.title.toLowerCase().trim());
        return db?.status === "completed";
      }).length;
      return {
        goalTitle,
        completed,
        total: goalTasks.length,
        color: goalAccent(goalIndex),
      };
    });
  }, [tasksByGoal, taskByTitle]);

  return (
    <div className="page-shell">
      <header className="animate-fade-in" style={{ marginBottom: "32px" }}>
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "8px" }}>
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
        <h1 style={{ fontSize: "clamp(1.75rem, 4vw, 2.5rem)", fontWeight: 400, letterSpacing: "-0.03em" }}>
          Today
        </h1>
        {rhythm && (
          <div style={{ marginTop: "16px", padding: "14px 18px", borderRadius: "var(--radius-md)", background: "var(--bg-glass)", border: "1px solid var(--border-color)" }}>
            <p style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "6px" }}>
              {planPhase === "morning" ? "Morning — plan" : planPhase === "afternoon" ? "Midday — adjust" : "Night — reflect"}
            </p>
            <p style={{ fontSize: "0.95rem", color: "var(--text-primary)", marginBottom: "4px" }}>{rhythm.focus_prompt}</p>
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: 0 }}>{rhythm.suggested_action}</p>
            {planPhase === "afternoon" && completedTasks > 0 && (
              <button
                type="button"
                className="btn-secondary"
                style={{ marginTop: "12px", fontSize: "0.85rem" }}
                disabled={adjustPlan.isPending || adjusting}
                onClick={() => {
                  setAdjusting(true);
                  const done = (tasks || []).filter((t) => t.status === "completed").map((t) => t.title);
                  adjustPlan.mutate(done);
                }}
              >
                {adjustPlan.isPending ? "Adjusting…" : "What got done? Adjust afternoon plan"}
              </button>
            )}
            {planPhase === "night" && (
              <Link href="/dashboard/plans#reflection" style={{ display: "inline-block", marginTop: "12px", fontSize: "0.85rem", color: "var(--accent-primary)" }}>
                What happened today? → Reflect
              </Link>
            )}
          </div>
        )}
      </header>

      {!isLoading && showSetup && <SetupChecklist hasGoals={hasGoals} />}

      {!isLoading && hasGoals && <PlanContextInterview hasInitiatives={hasGoals} />}

      {!isLoading && hasGoals && goalRings.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <span
              className="text-xs px-2.5 py-1 rounded-md"
              style={{
                background: "var(--bg-glass)",
                border: "0.5px solid var(--border-color)",
                color: "var(--text-secondary)",
              }}
            >
              {planPhase === "morning" ? "Morning" : planPhase === "afternoon" ? "Afternoon" : "Evening"} ·{" "}
              {totalTasks - completedTasks} tasks remaining
            </span>
          </div>
          <GoalCompletionRingRow goals={goalRings} />
        </section>
      )}

      {!isLoading && hasGoals && briefingBullets.length > 0 && (
        <section
          className="glass-card"
          style={{
            padding: "16px",
            marginBottom: "24px",
            borderLeft: "3px solid var(--accent-primary)",
          }}
        >
          <p
            style={{
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--text-muted)",
              marginBottom: "8px",
            }}
          >
            Daily briefing
          </p>
          {briefingData?.personalBriefing?.headline && (
            <p className="text-sm font-medium m-0 mb-2" style={{ color: "var(--text-primary)" }}>
              {briefingData.personalBriefing.headline}
            </p>
          )}
          <ul className="text-sm m-0 pl-4 space-y-1.5" style={{ color: "var(--text-secondary)" }}>
            {briefingBullets.slice(0, 3).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      {!isLoading && hasGoals && briefingBullets.length === 0 && topPriority && (
        <section
          className="glass-card"
          style={{
            padding: "16px",
            marginBottom: "24px",
            borderLeft: "3px solid var(--accent-primary)",
          }}
        >
          <p
            style={{
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--text-muted)",
              marginBottom: "8px",
            }}
          >
            Why today matters
          </p>
          <ul className="text-sm m-0 pl-4 space-y-1.5" style={{ color: "var(--text-secondary)" }}>
            {evidence.slice(0, 2).map((item) => (
              <li key={item}>{item}</li>
            ))}
            <li>{topPriority}</li>
            {plan?.whyTheseTasks && !genericWhy && <li>{plan.whyTheseTasks}</li>}
          </ul>
        </section>
      )}

      {timePromptTask && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
          <div className="glass-card modal-sheet" style={{ padding: "28px", maxWidth: 360, width: "calc(100% - 32px)" }}>
            <h3 style={{ fontSize: "1rem", marginBottom: "8px" }}>How long did it take?</h3>
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "16px" }}>
              Planned: {timePromptTask.estimated}m — actual time helps personalize future plans.
            </p>
            <input
              className="input-field"
              type="number"
              min={5}
              max={480}
              placeholder={`Minutes (e.g. ${timePromptTask.estimated})`}
              value={actualMinutesInput}
              onChange={(e) => setActualMinutesInput(e.target.value)}
              autoFocus
            />
            <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
              <button
                className="btn-primary"
                style={{ flex: 1 }}
                onClick={() =>
                  completeTask.mutate({
                    id: timePromptTask.id,
                    actualMinutes: Number(actualMinutesInput) || timePromptTask.estimated,
                  })
                }
              >
                Done
              </button>
              <button
                className="btn-secondary"
                onClick={() =>
                  completeTask.mutate({ id: timePromptTask.id })
                }
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      )}

        <ClayCard className="p-6 md:p-8" hover={false}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px", flexWrap: "wrap", gap: "12px" }}>
          <h2 className="text-base font-medium m-0">What to do — 3 tasks per goal</h2>
          {totalTasks > 0 && (
            <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
              {completedTasks}/{totalTasks} complete
            </span>
          )}
        </div>

        {isLoading ? (
          <div
            className="skeleton shimmer"
            style={{ height: "280px", width: "100%", borderRadius: "var(--radius-md)" }}
          />
        ) : plan?.tasks && plan.tasks.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
            {tasksByGoal.map(([goalTitle, goalTasks], goalIndex) => {
              const goalId = goalTitleToId.get(goalTitle.toLowerCase());
              const confidenceScore = goalId ? (userModelData?.goalConfidence?.[goalId]?.total ?? null) : null;
              const isLowConfidence = confidenceScore !== null && confidenceScore < 50;
              return (
              <div key={goalTitle}>
                <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                  <h3 className="text-sm font-medium m-0" style={{ color: goalAccent(goalIndex) }}>
                    {goalTitle}
                  </h3>
                  <span className="text-xs clay-label">{goalTasks.length}/3 tasks</span>
                </div>
                {isLowConfidence && goalId && (
                  <Link
                    href={`/dashboard/chat?intent=improve_confidence&goalId=${goalId}`}
                    className="no-underline flex items-center gap-2 mb-3 text-xs px-3 py-2 rounded-md"
                    style={{
                      background: "rgba(245, 158, 11, 0.08)",
                      border: "0.5px solid rgba(245, 158, 11, 0.3)",
                      color: "var(--accent-warning)",
                    }}
                  >
                    <Sparkles size={12} />
                    <span>
                      Low plan precision ({confidenceScore}%) — answer 2 questions to improve your tasks
                    </span>
                    <span className="ml-auto">→</span>
                  </Link>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {goalTasks.map((planTask, idx) => {
              const dbTask = resolveDbTask(planTask);
              const isDone = dbTask?.status === "completed";
              const whyLine = buildTaskWhyLine({
                title: planTask.title,
                whyItMatters: planTask.whyItMatters,
                linkedMilestone: planTask.linkedMilestone,
                linkedInitiative: planTask.linkedInitiative,
              });

              return (
                <div
                  key={`${planTask.title}-${idx}`}
                  style={{
                    padding: "16px",
                    borderRadius: "var(--radius-md)",
                    border: "0.5px solid var(--border-color)",
                    borderLeft: `3px solid ${goalAccent(goalIndex)}`,
                    background: "var(--bg-glass)",
                    opacity: isDone ? 0.45 : 1,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "14px",
                      marginBottom: "12px",
                    }}
                  >
                    {dbTask ? (
                      <TaskCheckButton
                        done={isDone}
                        accent={goalAccent(goalIndex)}
                        onClick={() =>
                          toggleTask.mutate({
                            id: dbTask.id,
                            status: dbTask.status,
                            estimated: planTask.estimatedMinutes,
                          })
                        }
                      />
                    ) : (
                      <Target
                        size={20}
                        style={{
                          color: "var(--accent-primary)",
                          marginTop: "3px",
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <div style={{ flex: 1 }}>
                      <h3
                        style={{
                          fontSize: "0.875rem",
                          fontWeight: 500,
                          lineHeight: 1.4,
                          textDecoration: isDone ? "line-through" : "none",
                          color: isDone
                            ? "var(--text-muted)"
                            : "var(--text-primary)",
                          margin: 0,
                        }}
                      >
                        {planTask.title}
                      </h3>
                      <p
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--text-muted)",
                          lineHeight: 1.5,
                          marginTop: "6px",
                          marginBottom: 0,
                        }}
                      >
                        {whyLine}
                      </p>
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          marginTop: "8px",
                          color: "var(--text-muted)",
                          fontSize: "0.6875rem",
                          padding: "2px 8px",
                          borderRadius: 4,
                          border: "0.5px solid var(--border-subtle)",
                        }}
                      >
                        <Clock size={12} />
                        {formatDuration(planTask.estimatedMinutes)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
                </div>
              </div>
            );
            })}
          </div>
        ) : (
          <p
            style={{
              fontSize: "0.95rem",
              color: "var(--text-muted)",
              fontWeight: 300,
              lineHeight: 1.8,
              textAlign: "center",
              padding: "40px 0",
            }}
          >
            {plan?.tasks?.length === 0 ? (
              <>
                Add an active goal with a deadline in{" "}
                <Link href="/dashboard/chat" style={{ color: "var(--accent-primary)", textDecoration: "underline" }}>
                  Coach
                </Link>
                {" "}— Mettle generates 3 coach tasks per goal per day from milestones and your recent activity.
              </>
            ) : (
              <>
                Add active goals with deadlines in{" "}
                <Link href="/dashboard/chat" style={{ color: "var(--accent-primary)", textDecoration: "underline" }}>
                  Coach
                </Link>
                {" "}— they drive your daily plan.
              </>
            )}
          </p>
        )}
        </ClayCard>

      {/* Daily Reflection — end of day context for tomorrow's plan */}
      <ReflectionSection todayKey={todayKey} />
    </div>
  );
}

function ReflectionSection({ todayKey }: { todayKey: string }) {
  const queryClient = useQueryClient();
  const [movedForward, setMovedForward] = useState("");
  const [blockedBy, setBlockedBy] = useState("");
  const [tomorrowContext, setTomorrowContext] = useState("");

  const { data: reflectionData, isLoading } = useQuery({
    queryKey: ["daily-reflection", todayKey],
    queryFn: async () => {
      const res = await fetch(`/api/reflections?date=${todayKey}`);
      if (!res.ok) return null;
      return res.json();
    },
  });

  const existing = reflectionData?.reflection;

  useEffect(() => {
    if (!existing) return;
    setMovedForward((prev) =>
      prev === (existing.moved_forward || "") ? prev : existing.moved_forward || ""
    );
    setBlockedBy((prev) =>
      prev === (existing.blocked_by || "") ? prev : existing.blocked_by || ""
    );
    setTomorrowContext((prev) =>
      prev === (existing.tomorrow_context || "") ? prev : existing.tomorrow_context || ""
    );
  }, [existing]);

  const saveReflection = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/reflections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ movedForward, blockedBy, tomorrowContext, reflectionDate: todayKey }),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["daily-reflection"] });
      queryClient.invalidateQueries({ queryKey: ["daily-plan"] });
    },
  });

  const hour = new Date().getHours();
  const showReflection = hour >= 18 || existing;

  if (!showReflection && !isLoading) return null;

  return (
    <section id="reflection" className="glass-card" style={{ padding: "clamp(20px, 4vw, 36px)", marginTop: "32px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
        <Sparkles size={18} style={{ color: "var(--accent-secondary)" }} />
        <h2 style={{ fontSize: "1rem", fontWeight: 500 }}>End of day reflection</h2>
      </div>
      <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "24px", lineHeight: 1.6 }}>
        Three questions. This context shapes tomorrow&apos;s plan — especially when execution didn&apos;t match the plan.
      </p>

      {isLoading ? (
        <div className="skeleton" style={{ height: "120px" }} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
              What moved forward today?
            </label>
            <textarea
              className="input-field"
              rows={2}
              value={movedForward}
              onChange={(e) => setMovedForward(e.target.value)}
              placeholder="Even small progress counts"
              style={{ resize: "vertical" }}
            />
          </div>
          <div>
            <label style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
              What blocked you?
            </label>
            <textarea
              className="input-field"
              rows={2}
              value={blockedBy}
              onChange={(e) => setBlockedBy(e.target.value)}
              placeholder="Meetings, energy, unclear priorities..."
              style={{ resize: "vertical" }}
            />
          </div>
          <div>
            <label style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
              What should tomorrow&apos;s plan know?
            </label>
            <textarea
              className="input-field"
              rows={2}
              value={tomorrowContext}
              onChange={(e) => setTomorrowContext(e.target.value)}
              placeholder="Constraints, priorities, anything time-sensitive"
              style={{ resize: "vertical" }}
            />
          </div>
          <div className="sticky-action">
            <button
              className="btn-primary"
              style={{ width: "100%", maxWidth: 320 }}
              onClick={() => saveReflection.mutate()}
              disabled={!movedForward.trim() || !blockedBy.trim() || !tomorrowContext.trim() || saveReflection.isPending}
            >
              {saveReflection.isPending ? "Saving..." : existing ? "Update reflection" : "Save reflection"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
