"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, Clock, Target, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { SetupChecklist } from "@/components/onboarding/setup-checklist";
import { PlanContextInterview } from "@/components/plans/plan-context-interview";
import { isLowPlanConfidence } from "@/lib/plans/language-guard";

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
  const [showContext, setShowContext] = useState(false);
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["today-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["execution-metrics"] });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["today-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["execution-metrics"] });
    },
  });

  const plan = planData?.plan;
  const coachInsight = plan?.planningContext?.coachInsight;
  const topPriority =
    coachInsight ||
    plan?.whatMattersNow ||
    plan?.daySummary;
  const metrics = executionData?.metrics;
  const completedTasks = tasks?.filter((t) => t.status === "completed").length || 0;
  const totalTasks = tasks?.length || 0;
  const completionRate =
    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const isLoading = planLoading || tasksLoading;
  const lowContext = plan?.confidence ? isLowPlanConfidence(plan.confidence.score) : false;
  const planningQuality = plan?.planningContext?.planningQuality;
  const evidence = plan?.evidence || [];
  const hasInitiatives = !evidence.some((e) => e.includes("No active initiatives"));
  const showSetup = !hasInitiatives;

  // Match plan tasks to DB tasks by title for checkboxes
  const taskByTitle = new Map(
    (tasks || []).map((t) => [t.title.toLowerCase(), t])
  );

  return (
    <div className="page-shell">
      <header className="animate-fade-in" style={{ marginBottom: "32px" }}>
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "8px" }}>
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
        <h1 style={{ fontSize: "clamp(1.75rem, 4vw, 2.5rem)", fontWeight: 400, letterSpacing: "-0.03em" }}>
          Today&apos;s Plan
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

      {!isLoading && showSetup && <SetupChecklist hasInitiatives={hasInitiatives} />}

      {!isLoading && hasInitiatives && <PlanContextInterview hasInitiatives={hasInitiatives} />}

      {topPriority && !isLoading && (
        <section
          className="glass-card"
          style={{
            padding: "24px 28px",
            marginBottom: "24px",
            borderLeft: "3px solid var(--accent-primary)",
          }}
        >
          <p style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "8px" }}>
            Top priority
          </p>
          <p style={{ fontSize: "1.15rem", lineHeight: 1.6, color: "var(--text-primary)", fontWeight: 400 }}>
            {topPriority}
          </p>
          {totalTasks > 0 && (
            <div style={{ marginTop: "14px" }}>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                {completedTasks}/{totalTasks} done today ({completionRate}%)
              </span>
            </div>
          )}
        </section>
      )}

      {(plan?.whyTheseTasks || plan?.topObstacle) && (
        <section className="glass-card" style={{ padding: "20px 24px", marginBottom: "24px" }}>
          <button
            type="button"
            onClick={() => setShowContext((v) => !v)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "none",
              border: "none",
              color: "var(--text-secondary)",
              cursor: "pointer",
              padding: 0,
              fontSize: "0.85rem",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Sparkles size={16} />
              Why these tasks?
            </span>
            {showContext ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {showContext && (
            <div style={{ marginTop: "16px" }}>
              {plan.evidence && plan.evidence.length > 0 && (
                <div style={{ marginBottom: "12px" }}>
                  <p style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "6px" }}>
                    Based on
                  </p>
                  <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                    {plan.evidence.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {lowContext && plan?.planningContext?.improvementHints?.length ? (
                <ul style={{ fontSize: "0.85rem", color: "#f59e0b", marginBottom: "12px", lineHeight: 1.5, paddingLeft: "18px" }}>
                  {plan.planningContext.improvementHints.map((hint) => (
                    <li key={hint}>{hint}</li>
                  ))}
                </ul>
              ) : lowContext ? (
                <p style={{ fontSize: "0.85rem", color: "#f59e0b", marginBottom: "12px", lineHeight: 1.5 }}>
                  Limited context — use the questions above or{" "}
                  <Link href="/dashboard/goals">add initiatives with deadlines</Link>.
                </p>
              ) : null}
              {plan.topObstacle && (
                <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginBottom: "8px" }}>
                  <strong style={{ fontWeight: 500, color: "var(--text-muted)" }}>Blocker: </strong>
                  {plan.topObstacle}
                </p>
              )}
              {plan.whyTheseTasks && (
                <p style={{ fontSize: "0.95rem", lineHeight: 1.7, color: "var(--text-primary)" }}>{plan.whyTheseTasks}</p>
              )}
            </div>
          )}
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

        <section className="glass-card" style={{ padding: "clamp(20px, 4vw, 36px)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px", flexWrap: "wrap", gap: "12px" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 500, margin: 0 }}>Today&apos;s focus</h2>
          {totalTasks > 0 && (
            <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
              {completedTasks}/{totalTasks} complete
            </span>
          )}
        </div>

        {isLoading ? (
          <div
            className="skeleton shimmer"
            style={{ height: "280px", width: "100%", borderRadius: "8px" }}
          />
        ) : plan?.tasks && plan.tasks.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            {plan.tasks.map((planTask, idx) => {
              const dbTask = taskByTitle.get(planTask.title.toLowerCase());
              const isDone = dbTask?.status === "completed";

              return (
                <div
                  key={`${planTask.title}-${idx}`}
                  style={{
                    padding: "24px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-color)",
                    background: isDone
                      ? "rgba(59, 130, 246, 0.04)"
                      : "rgba(255,255,255,0.02)",
                    opacity: isDone ? 0.75 : 1,
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
                      <button
                        onClick={() =>
                          toggleTask.mutate({
                            id: dbTask.id,
                            status: dbTask.status,
                            estimated: planTask.estimatedMinutes,
                          })
                        }
                        style={{
                          marginTop: "2px",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                          color: isDone
                            ? "var(--accent-primary)"
                            : "var(--text-muted)",
                          flexShrink: 0,
                        }}
                      >
                        {isDone ? (
                          <CheckCircle2 size={22} />
                        ) : (
                          <Circle size={22} />
                        )}
                      </button>
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
                          fontSize: "1.05rem",
                          fontWeight: 500,
                          lineHeight: 1.4,
                          textDecoration: isDone ? "line-through" : "none",
                          color: isDone
                            ? "var(--text-muted)"
                            : "var(--text-primary)",
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          flexWrap: "wrap",
                        }}
                      >
                        {planTask.title}
                        {planTask.isContextBuilding && (
                          <span
                            style={{
                              fontSize: "0.7rem",
                              padding: "2px 8px",
                              borderRadius: "999px",
                              background: "rgba(245, 158, 11, 0.15)",
                              color: "#f59e0b",
                              fontWeight: 500,
                              textDecoration: "none",
                            }}
                          >
                            context-building
                          </span>
                        )}
                      </h3>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          marginTop: "8px",
                          color: "var(--text-muted)",
                          fontSize: "0.85rem",
                        }}
                      >
                        <Clock size={14} />
                        {formatDuration(planTask.estimatedMinutes)}
                      </div>
                    </div>
                  </div>

                  <p
                    style={{
                      fontSize: "0.9rem",
                      color: "var(--text-secondary)",
                      lineHeight: 1.6,
                      marginBottom: "12px",
                      paddingLeft: dbTask ? "36px" : "34px",
                    }}
                  >
                    <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>Why? </span>
                    {planTask.whyItMatters}
                  </p>

                  {(planTask.linkedInitiative || planTask.linkedMilestone) && (
                    <div
                      style={{
                        paddingLeft: dbTask ? "36px" : "34px",
                        marginBottom: "12px",
                        fontSize: "0.82rem",
                        color: "var(--text-muted)",
                        lineHeight: 1.55,
                      }}
                    >
                      {planTask.linkedInitiative && (
                        <div>
                          <span style={{ fontWeight: 500 }}>Supports: </span>
                          {planTask.linkedInitiative}
                        </div>
                      )}
                      {planTask.linkedMilestone && (
                        <div>
                          <span style={{ fontWeight: 500 }}>Current milestone: </span>
                          {planTask.linkedMilestone}
                        </div>
                      )}
                    </div>
                  )}

                  <div
                    style={{
                      paddingLeft: dbTask ? "36px" : "34px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}
                  >
                    <div style={{ fontSize: "0.85rem", lineHeight: 1.5 }}>
                      <span style={{ color: "var(--text-muted)" }}>
                        Deliverable:{" "}
                      </span>
                      <span style={{ color: "var(--text-secondary)" }}>
                        {planTask.deliverable}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.85rem", lineHeight: 1.5 }}>
                      <span style={{ color: "var(--text-muted)" }}>Success: </span>
                      <span style={{ color: "var(--text-secondary)" }}>
                        {planTask.successMetric}
                      </span>
                    </div>
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
                Add an active initiative with a deadline on{" "}
                <Link href="/dashboard/goals" style={{ color: "var(--accent-primary)", textDecoration: "underline" }}>
                  Initiatives
                </Link>
                {" "}— daily tasks are generated from initiatives, not generic placeholders.
              </>
            ) : (
              <>
                Add active initiatives with deadlines on{" "}
                <Link href="/dashboard/goals" style={{ color: "var(--accent-primary)", textDecoration: "underline" }}>
                  Initiatives
                </Link>
                {" "}— they drive your daily plan.
              </>
            )}
          </p>
        )}
      </section>

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
  const showReflection = hour >= 17 || existing;

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
