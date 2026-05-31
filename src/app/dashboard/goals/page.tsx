"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { groupGoalsByTheme } from "@/lib/user-model/theme-dedup";
import {
  Target,
  Plus,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Trash2,
  Zap,
  Flag,
  Sparkles,
  MessageSquare,
  X,
} from "lucide-react";
import Link from "next/link";
import { LIFE_AREAS, lifeAreaLabel } from "@/lib/plans/life-areas";
import { computeInitiativeHealth, healthColor } from "@/lib/plans/initiative-health";
import { InfoTip, HEALTH_LEGEND } from "@/components/ui/info-tip";
import { auditInitiatives } from "@/lib/plans/data-quality";
import { isAbstractMilestone, milestoneProgressLabel } from "@/lib/plans/milestone-quality";

interface Goal {
  id: string;
  title: string;
  description: string | null;
  category: string;
  status: string;
  priority: string;
  progress: number;
  target_date: string | null;
  created_at: string;
}

interface Initiative {
  id: string;
  title: string;
  description: string | null;
  target_date: string | null;
  status: string;
  progress: number;
  goal_id: string | null;
  life_area: string;
  last_action_at: string | null;
  goals?: { title: string; category: string } | null;
  initiative_milestones?: Array<{ id: string; title: string; status: string; sort_order: number }>;
}

interface Opportunity {
  id: string;
  title: string;
  description: string | null;
  urgency: string;
  due_date: string | null;
  life_area: string;
  status: string;
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  due_date: string | null;
  streak_count: number;
  goal_id: string | null;
  initiative_id: string | null;
  recurrence: string | null;
  created_at: string;
}

const CATEGORIES = LIFE_AREAS.map((a) => ({ value: a.value, label: a.label, color: "#7c5cfc" }));

const PRIORITIES = ["low", "medium", "high", "critical"];

export default function GoalsPage() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [showAddInitiative, setShowAddInitiative] = useState(false);
  const [showAddOpportunity, setShowAddOpportunity] = useState(false);

  const [newGoal, setNewGoal] = useState({ title: "", description: "", category: "personal", priority: "medium", targetDate: "" });
  const [newInitiative, setNewInitiative] = useState({ title: "", description: "", goalId: "", targetDate: "", lifeArea: "personal" });
  const [newOpportunity, setNewOpportunity] = useState({ title: "", description: "", lifeArea: "personal", urgency: "medium", dueDate: "" });
  const [completionModal, setCompletionModal] = useState<{
    title: string;
    review: { summary: string; biggestWin: string; keyLearning: string; timelineEntry: string; suggestedNext?: string };
  } | null>(null);

  // Fetch goals
  const { data: goalsData, isLoading: goalsLoading } = useQuery({
    queryKey: ["goals", "direction"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data } = await supabase
        .from("goals")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false });
      return (data || []) as Goal[];
    },
  });

  // Fetch tasks
  const { data: tasksData, isLoading: tasksLoading } = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => {
      const res = await fetch("/api/tasks?status=all");
      if (!res.ok) return [];
      const json = await res.json();
      return (json.tasks || []) as Task[];
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  // Fetch initiatives
  const { data: initiativesData, isLoading: initiativesLoading } = useQuery({
    queryKey: ["initiatives"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const res = await fetch("/api/initiatives");
      const json = await res.json();
      return (json.initiatives || []) as Initiative[];
    },
  });

  const { data: opportunitiesData, isLoading: opportunitiesLoading } = useQuery({
    queryKey: ["opportunities"],
    queryFn: async () => {
      const res = await fetch("/api/opportunities");
      const json = await res.json();
      return (json.opportunities || []) as Opportunity[];
    },
  });

  const goals = goalsData || [];
  const initiatives = (initiativesData || []).filter((i) => i.status === "active");
  const opportunities = opportunitiesData || [];

  const tasks = tasksData || [];

  const tasksByInitiative = new Map<string, Task[]>();
  for (const t of tasks) {
    if (!t.initiative_id) continue;
    const list = tasksByInitiative.get(t.initiative_id) ?? [];
    list.push(t);
    tasksByInitiative.set(t.initiative_id, list);
  }

  const taskCountByInitiative = new Map<string, number>();
  const completedTasksByInitiative = new Map<string, number>();
  for (const [id, list] of tasksByInitiative) taskCountByInitiative.set(id, list.length);
  for (const t of tasks) {
    if (t.initiative_id && t.status === "completed") {
      completedTasksByInitiative.set(
        t.initiative_id,
        (completedTasksByInitiative.get(t.initiative_id) ?? 0) + 1
      );
    }
  }

  const dataIssues = auditInitiatives(
    initiatives.filter((i) => i.status === "active"),
    taskCountByInitiative
  );

  const createInitiative = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/initiatives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newInitiative.title,
          description: newInitiative.description,
          goalId: newInitiative.goalId || null,
          targetDate: newInitiative.targetDate || null,
          lifeArea: newInitiative.lifeArea,
        }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["initiatives"] });
      queryClient.invalidateQueries({ queryKey: ["daily-plan"] });
      setNewInitiative({ title: "", description: "", goalId: "", targetDate: "", lifeArea: "personal" });
      setShowAddInitiative(false);
    },
  });

  const createOpportunity = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newOpportunity),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["daily-plan"] });
      setNewOpportunity({ title: "", description: "", lifeArea: "personal", urgency: "medium", dueDate: "" });
      setShowAddOpportunity(false);
    },
  });

  const deleteOpportunity = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/opportunities?id=${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["daily-plan"] });
    },
  });

  const deleteInitiative = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/initiatives?id=${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["initiatives"] });
      queryClient.invalidateQueries({ queryKey: ["daily-plan"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-today"] });
    },
  });

  const setCurrentFocus = useMutation({
    mutationFn: async ({ initiativeId, until }: { initiativeId: string; until?: string }) => {
      const res = await fetch("/api/focus", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initiativeId, until }),
      });
      if (!res.ok) throw new Error("Failed to set focus");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-today"] });
      queryClient.invalidateQueries({ queryKey: ["daily-plan"] });
    },
  });

  const toggleMilestone = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "pending" | "in_progress" | "completed" }) => {
      await fetch("/api/milestones", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["initiatives"] });
      queryClient.invalidateQueries({ queryKey: ["daily-plan"] });
    },
  });

  const completeInitiative = useMutation({
    mutationFn: async (initiativeId: string) => {
      const res = await fetch("/api/initiatives/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initiativeId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setCompletionModal({ title: data.initiativeTitle, review: data.review });
      queryClient.invalidateQueries({ queryKey: ["initiatives"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-today"] });
      queryClient.invalidateQueries({ queryKey: ["daily-plan"] });
      queryClient.invalidateQueries({ queryKey: ["ai-suggestions"] });
      queryClient.invalidateQueries({ queryKey: ["memory-timeline"] });
    },
  });

  // Create goal mutation
  const createGoal = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newGoal),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setNewGoal({ title: "", description: "", category: "other", priority: "medium", targetDate: "" });
      setShowAddGoal(false);
    },
  });

  const regenerateMilestones = useMutation({
    mutationFn: async (initiativeId: string) => {
      const res = await fetch("/api/milestones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initiativeId }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["initiatives"] });
      queryClient.invalidateQueries({ queryKey: ["daily-plan"] });
    },
  });

  // Delete goal
  const deleteGoal = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/goals?id=${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });

  const activeInitiativeCount = initiatives.length;

  return (
    <div className="page-shell">
      {/* Header */}
      <div className="animate-fade-in" style={{ marginBottom: "32px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontSize: "1.8rem", fontWeight: 700, marginBottom: "6px", display: "flex", alignItems: "center", gap: "10px" }}>
            <Target size={28} style={{ color: "var(--accent-primary)" }} />
            Direction & Initiatives
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>
            Long-term direction is read-only context. Daily tasks come from <Link href="/dashboard/plans" style={{ color: "var(--accent-primary)" }}>Today&apos;s Plan</Link> via active initiatives.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button
            onClick={() => setShowAddInitiative(true)}
            className="btn-primary"
            style={{ padding: "10px 16px", fontSize: "0.85rem", opacity: activeInitiativeCount >= 3 ? 0.5 : 1 }}
            disabled={activeInitiativeCount >= 3}
            title={activeInitiativeCount >= 3 ? "Maximum 3 active initiatives" : undefined}
          >
            <Zap size={16} /> Add initiative
          </button>
          <button onClick={() => setShowAddOpportunity(true)} className="btn-secondary" style={{ padding: "10px 16px", fontSize: "0.85rem" }}>
            <Sparkles size={16} /> Opportunity
          </button>
          <button onClick={() => setShowAddGoal(true)} className="btn-secondary" style={{ padding: "10px 16px", fontSize: "0.85rem" }}>
            <Plus size={16} /> Long-term direction
          </button>
          <Link href="/dashboard/chat" className="btn-secondary" style={{ padding: "10px 16px", fontSize: "0.85rem", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <MessageSquare size={16} /> Ask AI to set up
          </Link>
        </div>
      </div>

      {/* Long-term direction — read-only context, never tasks */}
      <section style={{ marginBottom: "32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
          <Target size={18} style={{ color: "var(--text-muted)" }} />
          <h2 style={{ fontSize: "1rem", fontWeight: 600 }}>Long-term direction</h2>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>years · read-only · no tasks</span>
        </div>
        {goalsLoading ? (
          <div className="skeleton" style={{ height: "80px", width: "100%" }} />
        ) : goals.length === 0 ? (
          <div className="glass-card" style={{ padding: "24px", cursor: "default" }}>
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", lineHeight: 1.6, margin: 0 }}>
              Life outcomes you&apos;re building toward — financial freedom, health, career legacy. Add them here or let chat extract them over time.
            </p>
          </div>
        ) : (
          <div className="glass-card" style={{ padding: "20px 24px", cursor: "default" }}>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "12px" }}>
              {groupGoalsByTheme(goals).map(({ theme, goals: grouped }) => (
                <li key={theme} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
                  <div>
                    <div style={{ fontSize: "0.95rem", fontWeight: 500 }}>{theme}</div>
                    {grouped.length > 1 && (
                      <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "4px 0 0" }}>
                        {grouped.length} related goals grouped
                      </p>
                    )}
                    {grouped.length === 1 && grouped[0].description && (
                      <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", margin: "4px 0 0", lineHeight: 1.5 }}>{grouped[0].description}</p>
                    )}
                  </div>
                  <button
                    onClick={() => grouped.forEach((g) => deleteGoal.mutate(g.id))}
                    style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "4px", opacity: 0.5, flexShrink: 0 }}
                    title="Remove direction"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Active Initiatives — primary input for daily plans */}
      <section style={{ marginBottom: "32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
          <Zap size={18} style={{ color: "var(--accent-primary)" }} />
          <h2 style={{ fontSize: "1rem", fontWeight: 600 }}>Active initiatives</h2>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            {activeInitiativeCount === 1
              ? "1 active initiative"
              : `${activeInitiativeCount} active initiatives`}
          </span>
        </div>
        <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: "14px", lineHeight: 1.5 }}>
          <span title={HEALTH_LEGEND.on_track} style={{ marginRight: "12px" }}>● On Track</span>
          <span title={HEALTH_LEGEND.at_risk} style={{ marginRight: "12px" }}>● At Risk</span>
          <span title={HEALTH_LEGEND.stalled}>● Stalled</span>
          <InfoTip text="Hover each status for meaning. Health is based on deadline proximity and recent task activity." />
        </p>
        {dataIssues.length > 0 && (
          <div style={{ padding: "12px 14px", marginBottom: "12px", borderRadius: "var(--radius-md)", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
            {dataIssues.slice(0, 3).map((issue) => (
              <p key={issue.message} style={{ margin: "0 0 4px" }}>· {issue.message}</p>
            ))}
          </div>
        )}
        {initiativesLoading ? (
          <div className="skeleton" style={{ height: "72px" }} />
        ) : initiatives.length === 0 ? (
          <div className="glass-card" style={{ padding: "24px", cursor: "default" }}>
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", lineHeight: 1.6 }}>
              Add a specific initiative with a deadline. Example: &quot;Crack senior developer interview by July&quot; or &quot;Lose 5 kg by August&quot;.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {initiatives.map((init) => {
              const health = computeInitiativeHealth({
                status: init.status,
                targetDate: init.target_date,
                lastActionAt: init.last_action_at,
                progress: init.progress,
              });
              const milestones = [...(init.initiative_milestones || [])].sort(
                (a, b) => a.sort_order - b.sort_order
              );
              const currentMilestone = milestones.find((m) => m.status === "in_progress");
              const abstractMilestones = milestones.filter((m) => isAbstractMilestone(m.title));
              const completedToward = completedTasksByInitiative.get(init.id) ?? 0;
              return (
              <div key={init.id} className="glass-card" style={{ padding: "16px 18px", cursor: "default", display: "flex", alignItems: "flex-start", gap: "12px" }}>
                <Flag size={16} style={{ color: healthColor(health.health), marginTop: "3px", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: "0.95rem", marginBottom: "4px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    {init.title}
                    <span style={{ fontSize: "0.7rem", padding: "2px 8px", borderRadius: "999px", background: "var(--bg-glass)", color: healthColor(health.health) }} title={HEALTH_LEGEND[health.health]}>
                      {health.label}
                    </span>
                  </div>
                  <p style={{ fontSize: "0.78rem", color: health.health === "at_risk" ? "#f59e0b" : "var(--text-muted)", margin: "2px 0 4px" }}>
                    {health.reason}
                  </p>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <span>{lifeAreaLabel(init.life_area)}</span>
                    {init.goals?.title && <span>Goal: {init.goals.title}</span>}
                    {init.target_date && <span>Due {init.target_date}</span>}
                    {health.daysSinceLastAction !== null && <span>Last action {health.daysSinceLastAction}d ago</span>}
                  </div>
                  {init.description && (
                    <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginTop: "6px", lineHeight: 1.5 }}>{init.description}</p>
                  )}
                  {abstractMilestones.length > 0 && (
                    <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: "var(--radius-md)", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                      <p style={{ margin: "0 0 8px" }}>These milestones read like phases, not actions. Regenerate them into steps you can finish and measure.</p>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ fontSize: "0.75rem", padding: "4px 10px" }}
                        disabled={regenerateMilestones.isPending}
                        onClick={() => regenerateMilestones.mutate(init.id)}
                      >
                        {regenerateMilestones.isPending ? "Regenerating…" : "Make milestones actionable"}
                      </button>
                    </div>
                  )}
                  {currentMilestone && (
                    <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: "var(--radius-md)", background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)" }}>
                      <p style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", margin: "0 0 4px" }}>
                        Current milestone
                      </p>
                      <p style={{ fontSize: "0.92rem", fontWeight: 500, margin: "0 0 6px", color: "var(--text-primary)" }}>
                        {currentMilestone.title}
                      </p>
                      <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: 0 }}>
                        Progress: {milestoneProgressLabel(currentMilestone.title, completedToward)}
                      </p>
                    </div>
                  )}
                  {milestones.length > 0 && (
                    <ul style={{ marginTop: "12px", paddingLeft: "0", listStyle: "none", display: "flex", flexDirection: "column", gap: "6px" }}>
                      {milestones.map((m) => (
                        <li key={m.id} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.82rem" }}>
                          <button
                            type="button"
                            onClick={() =>
                              toggleMilestone.mutate({
                                id: m.id,
                                status: m.status === "completed" ? "in_progress" : "completed",
                              })
                            }
                            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: m.status === "completed" ? "var(--accent-primary)" : "var(--text-muted)" }}
                          >
                            {m.status === "completed" ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                          </button>
                          <span
                            style={{
                              color: m.status === "in_progress" ? "var(--text-primary)" : m.status === "completed" ? "var(--text-muted)" : "var(--text-secondary)",
                              textDecoration: m.status === "completed" ? "line-through" : "none",
                              fontWeight: m.status === "in_progress" ? 500 : 400,
                            }}
                          >
                            {m.title}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <button
                    type="button"
                    onClick={() => setCurrentFocus.mutate({ initiativeId: init.id, until: init.target_date || undefined })}
                    style={{
                      marginTop: "10px",
                      fontSize: "0.75rem",
                      padding: "4px 10px",
                      borderRadius: "999px",
                      border: "1px solid var(--border-color)",
                      background: "var(--bg-glass)",
                      color: "var(--accent-primary)",
                      cursor: "pointer",
                      marginRight: "8px",
                    }}
                  >
                    Set as current focus
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Mark "${init.title}" complete? This archives the initiative and generates a review.`)) {
                        completeInitiative.mutate(init.id);
                      }
                    }}
                    style={{
                      marginTop: "10px",
                      fontSize: "0.75rem",
                      padding: "4px 10px",
                      borderRadius: "999px",
                      border: "1px solid var(--border-color)",
                      background: "var(--bg-glass)",
                      color: "var(--text-secondary)",
                      cursor: "pointer",
                    }}
                  >
                    Mark complete
                  </button>
                </div>
                <button
                  onClick={() => deleteInitiative.mutate(init.id)}
                  style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "4px", opacity: 0.5 }}
                  title="Remove initiative"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );})}
          </div>
        )}
      </section>

      {/* Opportunities — time-sensitive upside */}
      <section style={{ marginBottom: "32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
          <Sparkles size={18} style={{ color: "var(--accent-secondary)" }} />
          <h2 style={{ fontSize: "1rem", fontWeight: 600 }}>Opportunities</h2>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>can outweigh routine tasks</span>
        </div>
        <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: "14px", lineHeight: 1.55 }}>
          Time-sensitive events that deserve priority over routine plans.
        </p>
        <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: "14px", lineHeight: 1.55 }}>
          Examples: interview invitation · client lead · scholarship deadline · sales opportunity
        </p>
        {opportunitiesLoading ? (
          <div className="skeleton" style={{ height: "72px" }} />
        ) : opportunities.length === 0 ? (
          <div className="glass-card" style={{ padding: "24px", cursor: "default" }}>
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", lineHeight: 1.6 }}>
              Anything unusually important or time-sensitive this week? Interview invite, client lead, scholarship deadline?
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {opportunities.map((opp) => (
              <div key={opp.id} className="glass-card" style={{ padding: "16px 18px", cursor: "default", display: "flex", gap: "12px" }}>
                <Sparkles size={16} style={{ color: "var(--accent-secondary)", marginTop: "3px", flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>{opp.title}</div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "4px" }}>
                    {opp.urgency} urgency · {lifeAreaLabel(opp.life_area)}
                    {opp.due_date && ` · due ${opp.due_date}`}
                  </div>
                  {opp.description && <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginTop: "6px" }}>{opp.description}</p>}
                </div>
                <button onClick={() => deleteOpportunity.mutate(opp.id)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", opacity: 0.5 }}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Add Goal Modal */}
      {showAddGoal && (
        <Modal title="Add long-term direction" onClose={() => setShowAddGoal(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <input
              className="input-field" placeholder="What do you want to achieve?"
              value={newGoal.title} onChange={(e) => setNewGoal({ ...newGoal, title: e.target.value })}
              autoFocus
            />
            <textarea
              className="input-field" placeholder="Description (optional)" rows={2}
              value={newGoal.description} onChange={(e) => setNewGoal({ ...newGoal, description: e.target.value })}
              style={{ resize: "vertical" }}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <select
                className="input-field" value={newGoal.category}
                onChange={(e) => setNewGoal({ ...newGoal, category: e.target.value })}
              >
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <select
                className="input-field" value={newGoal.priority}
                onChange={(e) => setNewGoal({ ...newGoal, priority: e.target.value })}
              >
                {PRIORITIES.map((p) => <option key={p} value={p} style={{ textTransform: "capitalize" }}>{p}</option>)}
              </select>
            </div>
            <input
              className="input-field" type="date" value={newGoal.targetDate}
              onChange={(e) => setNewGoal({ ...newGoal, targetDate: e.target.value })}
            />
            <button
              className="btn-primary" style={{ width: "100%", marginTop: "4px" }}
              onClick={() => createGoal.mutate()}
              disabled={!newGoal.title || createGoal.isPending}
            >
              {createGoal.isPending ? "Creating..." : "Add direction"}
            </button>
          </div>
        </Modal>
      )}

      {/* Add Initiative Modal */}
      {showAddInitiative && (
        <Modal title="Add Active Initiative" onClose={() => setShowAddInitiative(false)}>
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: 1.5, marginBottom: "4px" }}>
            Be specific with a deadline. Example: &quot;Crack senior developer interview by July&quot; or &quot;Lose 5 kg by August&quot;.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <input
              className="input-field"
              placeholder="Specific project with a measurable outcome"
              value={newInitiative.title}
              onChange={(e) => setNewInitiative({ ...newInitiative, title: e.target.value })}
              autoFocus
            />
            <textarea
              className="input-field"
              placeholder="What does done look like? (optional)"
              rows={2}
              value={newInitiative.description}
              onChange={(e) => setNewInitiative({ ...newInitiative, description: e.target.value })}
              style={{ resize: "vertical" }}
            />
            <select
              className="input-field"
              value={newInitiative.lifeArea}
              onChange={(e) => setNewInitiative({ ...newInitiative, lifeArea: e.target.value })}
            >
              {LIFE_AREAS.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
            <select
              className="input-field"
              value={newInitiative.goalId}
              onChange={(e) => setNewInitiative({ ...newInitiative, goalId: e.target.value })}
            >
              <option value="">Link to goal (optional)</option>
              {goals.filter((g) => g.status === "active").map((g) => (
                <option key={g.id} value={g.id}>{g.title}</option>
              ))}
            </select>
            <input
              className="input-field"
              type="date"
              required
              value={newInitiative.targetDate}
              onChange={(e) => setNewInitiative({ ...newInitiative, targetDate: e.target.value })}
            />
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "-6px" }}>Deadline is required — it drives your daily plan.</p>
            <button
              className="btn-primary"
              style={{ width: "100%", marginTop: "4px" }}
              onClick={() => createInitiative.mutate()}
              disabled={!newInitiative.title || !newInitiative.targetDate || createInitiative.isPending}
            >
              {createInitiative.isPending ? "Creating..." : "Create Initiative"}
            </button>
          </div>
        </Modal>
      )}

      {showAddOpportunity && (
        <Modal title="Log an Opportunity" onClose={() => setShowAddOpportunity(false)}>
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: 1.5, marginBottom: "4px" }}>
            Time-sensitive upside — interview invite, client lead, scholarship, partnership.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <input
              className="input-field"
              placeholder="What's the opportunity?"
              value={newOpportunity.title}
              onChange={(e) => setNewOpportunity({ ...newOpportunity, title: e.target.value })}
              autoFocus
            />
            <textarea
              className="input-field"
              placeholder="Why does it matter now? (optional)"
              rows={2}
              value={newOpportunity.description}
              onChange={(e) => setNewOpportunity({ ...newOpportunity, description: e.target.value })}
              style={{ resize: "vertical" }}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <select className="input-field" value={newOpportunity.lifeArea} onChange={(e) => setNewOpportunity({ ...newOpportunity, lifeArea: e.target.value })}>
                {LIFE_AREAS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
              <select className="input-field" value={newOpportunity.urgency} onChange={(e) => setNewOpportunity({ ...newOpportunity, urgency: e.target.value })}>
                <option value="low">Low urgency</option>
                <option value="medium">Medium urgency</option>
                <option value="high">High urgency</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <input className="input-field" type="date" value={newOpportunity.dueDate} onChange={(e) => setNewOpportunity({ ...newOpportunity, dueDate: e.target.value })} />
            <button className="btn-primary" style={{ width: "100%" }} onClick={() => createOpportunity.mutate()} disabled={!newOpportunity.title || createOpportunity.isPending}>
              {createOpportunity.isPending ? "Saving..." : "Save Opportunity"}
            </button>
          </div>
        </Modal>
      )}
      {completionModal && (
        <Modal title={`Completed: ${completionModal.title}`} onClose={() => setCompletionModal(null)}>
          <p style={{ fontSize: "0.95rem", lineHeight: 1.7, color: "var(--text-primary)", marginBottom: 16 }}>
            {completionModal.review.summary}
          </p>
          <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: 8 }}>
            <strong>Biggest win:</strong> {completionModal.review.biggestWin}
          </p>
          <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: 8 }}>
            <strong>Learning:</strong> {completionModal.review.keyLearning}
          </p>
          <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: 16 }}>
            Added to your <Link href="/dashboard/timeline" style={{ color: "var(--accent-primary)" }}>Memory Timeline</Link>.
          </p>
          {completionModal.review.suggestedNext && (
            <p style={{ fontSize: "0.85rem", color: "var(--accent-primary)" }}>
              Suggested next: {completionModal.review.suggestedNext} — check Overview for the suggestion banner.
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}

// ===== Sub-components =====

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
    }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="glass-card animate-slide-up"
        style={{ width: "100%", maxWidth: 460, padding: "28px", cursor: "default" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h3 style={{ fontSize: "1.1rem", fontWeight: 600 }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
