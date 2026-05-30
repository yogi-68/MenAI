"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Calendar, CheckCircle2, Circle, Clock, Target, AlertTriangle, Sparkles, TrendingUp } from "lucide-react";

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
  tasks: DailyPlanTask[];
}

interface DailyPlanTask {
  title: string;
  whyItMatters: string;
  estimatedMinutes: number;
  deliverable: string;
  successMetric: string;
  isContextBuilding: boolean;
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

function planModeLabel(mode?: string) {
  if (mode === "context_building") return "Context-building";
  if (mode === "aggressive") return "Aggressive execution";
  return "Standard";
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function confidenceColor(score: number) {
  if (score >= 75) return "var(--accent-primary)";
  if (score >= 45) return "#f59e0b";
  return "#ef4444";
}

export default function DailyPlansPage() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const todayKey = new Date().toISOString().split("T")[0];
  const [timePromptTask, setTimePromptTask] = useState<{ id: string; estimated: number } | null>(null);
  const [actualMinutesInput, setActualMinutesInput] = useState("");

  const { data: planData, isLoading: planLoading } = useQuery({
    queryKey: ["daily-plan", todayKey],
    queryFn: async () => {
      const res = await fetch("/api/plans/generate");
      if (!res.ok) throw new Error("Failed to load plan");
      return res.json() as Promise<{ plan: DailyPlanContent; created: boolean }>;
    },
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const { data: tasks, isLoading: tasksLoading } = useQuery({
    queryKey: ["today-tasks", todayKey],
    queryFn: async () => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser) return [];

      const { data } = await supabase
        .from("tasks")
        .select("*")
        .eq("user_id", authUser.id)
        .eq("due_date", todayKey)
        .order("created_at", { ascending: true });

      return (data || []) as Task[];
    },
    staleTime: 30_000,
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
    },
  });

  const plan = planData?.plan;
  const metrics = executionData?.metrics;
  const completedTasks = tasks?.filter((t) => t.status === "completed").length || 0;
  const totalTasks = tasks?.length || 0;
  const completionRate =
    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const isLoading = planLoading || tasksLoading;

  // Match plan tasks to DB tasks by title for checkboxes
  const taskByTitle = new Map(
    (tasks || []).map((t) => [t.title.toLowerCase(), t])
  );

  return (
    <div
      style={{
        padding: "64px 48px",
        maxWidth: "1100px",
        margin: "0 auto",
        width: "100%",
      }}
    >
      <div className="animate-fade-in" style={{ marginBottom: "48px" }}>
        <h1
          style={{
            fontSize: "2.5rem",
            fontWeight: 400,
            letterSpacing: "-0.03em",
            lineHeight: 1.2,
          }}
        >
          Today&apos;s Plan
        </h1>
        <p
          style={{
            color: "var(--text-secondary)",
            fontSize: "1.1rem",
            marginTop: "12px",
            fontWeight: 300,
            lineHeight: 1.6,
          }}
        >
          {new Date().toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>
        {plan?.daySummary && (
          <p
            style={{
              color: "var(--text-primary)",
              fontSize: "1rem",
              marginTop: "20px",
              fontWeight: 300,
              lineHeight: 1.7,
              maxWidth: "640px",
            }}
          >
            {plan.daySummary}
            {plan.planMode && (
              <span style={{ display: "block", marginTop: "8px", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                Mode: {planModeLabel(plan.planMode)}
              </span>
            )}
          </p>
        )}

        {metrics && (
          <section className="glass-card" style={{ padding: "20px 24px", marginTop: "24px", marginBottom: "24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <TrendingUp size={16} style={{ color: "var(--accent-primary)" }} />
              <span style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>
                Execution rate (planned tasks)
              </span>
            </div>
            <div style={{ display: "flex", gap: "32px", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: "1.5rem", fontWeight: 300 }}>{metrics.last7Days.rate}%</div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>7-day ({metrics.last7Days.completed}/{metrics.last7Days.total})</div>
              </div>
              <div>
                <div style={{ fontSize: "1.5rem", fontWeight: 300 }}>{metrics.last30Days.rate}%</div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>30-day ({metrics.last30Days.completed}/{metrics.last30Days.total})</div>
              </div>
            </div>
          </section>
        )}
        {(plan?.whatMattersNow || plan?.topObstacle || plan?.whyTheseTasks) && (
          <section
            className="glass-card"
            style={{ padding: "28px 32px", marginBottom: "32px" }}
          >
            {plan.confidence && (
              <div style={{ marginBottom: "20px" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: "12px",
                    marginBottom: "12px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.8rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "var(--text-muted)",
                    }}
                  >
                    Plan confidence
                  </span>
                  <span
                    style={{
                      fontSize: "1.25rem",
                      fontWeight: 600,
                      color: confidenceColor(plan.confidence.score),
                    }}
                  >
                    {plan.confidence.score}%
                  </span>
                </div>
                {plan.confidence.score < 50 && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "8px",
                      padding: "12px 14px",
                      borderRadius: "var(--radius-md)",
                      background: "rgba(239, 68, 68, 0.08)",
                      border: "1px solid rgba(239, 68, 68, 0.2)",
                      marginBottom: "12px",
                      fontSize: "0.85rem",
                      color: "var(--text-secondary)",
                      lineHeight: 1.5,
                    }}
                  >
                    <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: "2px", color: "#ef4444" }} />
                    Low context — don&apos;t blindly trust this plan.{" "}
                    <Link href="/dashboard/goals" style={{ color: "var(--accent-primary)", textDecoration: "underline" }}>
                      Add initiatives with deadlines
                    </Link>
                    .
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {plan.confidence.gaps.map((gap) => (
                    <p key={gap} style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: 0 }}>
                      · {gap}
                    </p>
                  ))}
                  {plan.confidence.strengths.map((s) => (
                    <p key={s} style={{ fontSize: "0.8rem", color: "var(--accent-primary)", margin: 0, opacity: 0.9 }}>
                      ✓ {s}
                    </p>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
              <Sparkles size={16} style={{ color: "var(--accent-secondary)" }} />
              <span style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>
                Why these tasks?
              </span>
            </div>

            {plan.whatMattersNow && (
              <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "8px" }}>
                <span style={{ color: "var(--text-muted)" }}>What matters today: </span>
                {plan.whatMattersNow}
              </p>
            )}
            {plan.topObstacle && (
              <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "12px" }}>
                <span style={{ color: "var(--text-muted)" }}>Main obstacle: </span>
                {plan.topObstacle}
              </p>
            )}
            {plan.whyTheseTasks && (
              <p style={{ fontSize: "0.95rem", color: "var(--text-primary)", lineHeight: 1.7, fontWeight: 300 }}>
                {plan.whyTheseTasks}
              </p>
            )}
            {plan.lifeAreaInsight && (
              <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "12px", lineHeight: 1.6 }}>
                {plan.lifeAreaInsight}
              </p>
            )}
            {plan.assumptions && plan.assumptions.length > 0 && (
              <div style={{ marginTop: "12px" }}>
                <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "4px" }}>Assumptions</p>
                {plan.assumptions.map((a) => (
                  <p key={a} style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: 0 }}>· {a}</p>
                ))}
              </div>
            )}
            {plan.timeEstimationInsight && (
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "12px" }}>{plan.timeEstimationInsight}</p>
            )}
          </section>
        )}
      </div>

      {timePromptTask && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
          <div className="glass-card" style={{ padding: "28px", maxWidth: 360, width: "100%" }}>
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

      {totalTasks > 0 && (
        <section
          className="glass-card"
          style={{ padding: "28px 36px", marginBottom: "32px" }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "16px",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "0.8rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "var(--text-muted)",
                  marginBottom: "6px",
                }}
              >
                Done today
              </div>
              <div style={{ fontSize: "1.75rem", fontWeight: 300 }}>
                {completedTasks} / {totalTasks}
              </div>
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 300, color: "var(--accent-primary)" }}>
              {completionRate}%
            </div>
          </div>
        </section>
      )}

      <section className="glass-card" style={{ padding: "40px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginBottom: "28px",
          }}
        >
          <Calendar size={20} style={{ color: "var(--text-muted)" }} />
          <h2
            style={{
              fontSize: "0.85rem",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "var(--text-secondary)",
              fontWeight: 500,
            }}
          >
            Today&apos;s Actions
          </h2>
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
                    {planTask.whyItMatters}
                  </p>

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
                      <span style={{ color: "var(--text-muted)" }}>Done when: </span>
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
            Add active initiatives with deadlines on{" "}
            <Link href="/dashboard/goals" style={{ color: "var(--accent-primary)", textDecoration: "underline" }}>
              Goals &amp; Tasks
            </Link>
            {" "}— they drive your daily plan.
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
    if (existing) {
      setMovedForward(existing.moved_forward || "");
      setBlockedBy(existing.blocked_by || "");
      setTomorrowContext(existing.tomorrow_context || "");
    }
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
    <section className="glass-card" style={{ padding: "36px 40px", marginTop: "32px" }}>
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
          <button
            className="btn-primary"
            style={{ alignSelf: "flex-start" }}
            onClick={() => saveReflection.mutate()}
            disabled={!movedForward.trim() || !blockedBy.trim() || !tomorrowContext.trim() || saveReflection.isPending}
          >
            {saveReflection.isPending ? "Saving..." : existing ? "Update reflection" : "Save reflection"}
          </button>
        </div>
      )}
    </section>
  );
}
