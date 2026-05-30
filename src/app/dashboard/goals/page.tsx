"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Target,
  Plus,
  CheckCircle2,
  Circle,
  Flame,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Trash2,
  TrendingUp,
  X,
  Zap,
  Flag,
  Sparkles,
} from "lucide-react";
import { LIFE_AREAS, lifeAreaLabel } from "@/lib/plans/life-areas";
import { computeInitiativeHealth, healthColor } from "@/lib/plans/initiative-health";

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
  recurrence: string | null;
  created_at: string;
}

const CATEGORIES = LIFE_AREAS.map((a) => ({ value: a.value, label: a.label, color: "#7c5cfc" }));

const PRIORITIES = ["low", "medium", "high", "critical"];

export default function GoalsPage() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showAddInitiative, setShowAddInitiative] = useState(false);
  const [showAddOpportunity, setShowAddOpportunity] = useState(false);
  const [expandedGoals, setExpandedGoals] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"all" | "active" | "completed">("active");

  const [newGoal, setNewGoal] = useState({ title: "", description: "", category: "personal", priority: "medium", targetDate: "" });
  const [newTask, setNewTask] = useState({ title: "", goalId: "", dueDate: "", recurrence: "" });
  const [newInitiative, setNewInitiative] = useState({ title: "", description: "", goalId: "", targetDate: "", lifeArea: "personal" });
  const [newOpportunity, setNewOpportunity] = useState({ title: "", description: "", lifeArea: "personal", urgency: "medium", dueDate: "" });

  // Fetch goals
  const { data: goalsData, isLoading: goalsLoading } = useQuery({
    queryKey: ["goals", filter],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      let query = supabase.from("goals").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
      if (filter !== "all") query = query.eq("status", filter);
      const { data } = await query;
      return (data || []) as Goal[];
    },
  });

  // Fetch tasks
  const { data: tasksData, isLoading: tasksLoading } = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data } = await supabase
        .from("tasks").select("*").eq("user_id", user.id)
        .in("status", ["pending", "in_progress", "completed"])
        .order("due_date", { ascending: true });
      return (data || []) as Task[];
    },
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
  const tasks = tasksData || [];
  const initiatives = initiativesData || [];
  const opportunities = opportunitiesData || [];

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

  // Create task mutation
  const createTask = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTask),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setNewTask({ title: "", goalId: "", dueDate: "", recurrence: "" });
      setShowAddTask(false);
    },
  });

  // Toggle task completion
  const toggleTask = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const newStatus = status === "completed" ? "pending" : "completed";
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: newStatus }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
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

  const toggleGoalExpanded = (goalId: string) => {
    const next = new Set(expandedGoals);
    if (next.has(goalId)) next.delete(goalId);
    else next.add(goalId);
    setExpandedGoals(next);
  };

  const getGoalTasks = (goalId: string) => tasks.filter((t) => t.goal_id === goalId);
  const unlinkedTasks = tasks.filter((t) => !t.goal_id);
  const getCatColor = (cat: string) => CATEGORIES.find((c) => c.value === cat)?.color || "#888";

  return (
    <div style={{ padding: "32px", maxWidth: "1000px", margin: "0 auto" }}>
      {/* Header */}
      <div className="animate-fade-in" style={{ marginBottom: "32px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontSize: "1.8rem", fontWeight: 700, marginBottom: "6px", display: "flex", alignItems: "center", gap: "10px" }}>
            <Target size={28} style={{ color: "var(--accent-primary)" }} />
            Goals & Tasks
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>
            Goals are direction. Initiatives are what you&apos;re actually executing — they drive your daily plan.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button onClick={() => setShowAddInitiative(true)} className="btn-secondary" style={{ padding: "10px 16px", fontSize: "0.85rem" }}>
            <Zap size={16} /> Initiative
          </button>
          <button onClick={() => setShowAddOpportunity(true)} className="btn-secondary" style={{ padding: "10px 16px", fontSize: "0.85rem" }}>
            <Sparkles size={16} /> Opportunity
          </button>
          <button onClick={() => setShowAddTask(true)} className="btn-secondary" style={{ padding: "10px 16px", fontSize: "0.85rem" }}>
            <Plus size={16} /> Task
          </button>
          <button onClick={() => setShowAddGoal(true)} className="btn-primary" style={{ padding: "10px 16px", fontSize: "0.85rem" }}>
            <Plus size={16} /> Goal
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "24px", background: "var(--bg-glass)", borderRadius: "var(--radius-md)", padding: "4px" }}>
        {(["active", "completed", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: "8px 16px",
              borderRadius: "var(--radius-sm)",
              border: "none",
              background: filter === f ? "var(--accent-primary)" : "transparent",
              color: filter === f ? "white" : "var(--text-secondary)",
              cursor: "pointer",
              fontSize: "0.85rem",
              fontWeight: 500,
              textTransform: "capitalize",
              transition: "all 0.2s ease",
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Active Initiatives — primary input for daily plans */}
      <section style={{ marginBottom: "32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
          <Zap size={18} style={{ color: "var(--accent-primary)" }} />
          <h2 style={{ fontSize: "1rem", fontWeight: 600 }}>Active Initiatives</h2>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>feeds daily plan</span>
        </div>
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
              return (
              <div key={init.id} className="glass-card" style={{ padding: "16px 18px", cursor: "default", display: "flex", alignItems: "flex-start", gap: "12px" }}>
                <Flag size={16} style={{ color: healthColor(health.health), marginTop: "3px", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: "0.95rem", marginBottom: "4px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    {init.title}
                    <span style={{ fontSize: "0.7rem", padding: "2px 8px", borderRadius: "999px", background: "var(--bg-glass)", color: healthColor(health.health) }}>
                      {health.label}
                    </span>
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <span>{lifeAreaLabel(init.life_area)}</span>
                    {init.goals?.title && <span>Goal: {init.goals.title}</span>}
                    {init.target_date && <span>Due {init.target_date}</span>}
                    {health.daysSinceLastAction !== null && <span>Last action {health.daysSinceLastAction}d ago</span>}
                  </div>
                  {init.description && (
                    <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginTop: "6px", lineHeight: 1.5 }}>{init.description}</p>
                  )}
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

      {/* Goals List */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "32px" }}>
        {goalsLoading ? (
          <div className="skeleton" style={{ height: "80px", width: "100%" }} />
        ) : goals.length === 0 ? (
          <div className="glass-card" style={{ padding: "40px", textAlign: "center", cursor: "default" }}>
            <Target size={40} style={{ color: "var(--text-muted)", opacity: 0.3, marginBottom: "12px" }} />
            <p style={{ color: "var(--text-muted)", fontSize: "0.95rem" }}>
              No {filter === "all" ? "" : filter} goals yet. Talk to your AI mentor or add one manually.
            </p>
          </div>
        ) : (
          goals.map((goal) => {
            const goalTasks = getGoalTasks(goal.id);
            const isExpanded = expandedGoals.has(goal.id);
            const completedTasks = goalTasks.filter((t) => t.status === "completed").length;

            return (
              <div key={goal.id} className="glass-card" style={{ padding: "0", cursor: "default", overflow: "hidden" }}>
                {/* Goal Header */}
                <div
                  style={{
                    padding: "18px 20px",
                    display: "flex",
                    alignItems: "center",
                    gap: "14px",
                    cursor: "pointer",
                  }}
                  onClick={() => toggleGoalExpanded(goal.id)}
                >
                  {isExpanded ? <ChevronDown size={18} style={{ color: "var(--text-muted)" }} /> : <ChevronRight size={18} style={{ color: "var(--text-muted)" }} />}

                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: getCatColor(goal.category), flexShrink: 0 }} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "2px" }}>{goal.title}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "flex", gap: "8px", alignItems: "center" }}>
                      <span style={{ textTransform: "capitalize" }}>{goal.category}</span>
                      <span>•</span>
                      <span style={{
                        color: goal.priority === "critical" ? "var(--accent-tertiary)" : goal.priority === "high" ? "var(--accent-warm)" : "var(--text-muted)",
                        textTransform: "capitalize",
                      }}>
                        {goal.priority}
                      </span>
                      {goalTasks.length > 0 && (
                        <>
                          <span>•</span>
                          <span>{completedTasks}/{goalTasks.length} tasks</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Progress */}
                  <div style={{ width: 80, textAlign: "right" }}>
                    <div style={{ fontSize: "0.85rem", fontWeight: 700, marginBottom: "4px" }}>{goal.progress}%</div>
                    <div style={{ width: "100%", height: 4, borderRadius: 2, background: "var(--bg-glass)" }}>
                      <div style={{
                        width: `${goal.progress}%`, height: "100%", borderRadius: 2,
                        background: getCatColor(goal.category),
                        transition: "width 0.5s ease",
                      }} />
                    </div>
                  </div>

                  <button
                    onClick={(e) => { e.stopPropagation(); deleteGoal.mutate(goal.id); }}
                    style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "4px", opacity: 0.5 }}
                    title="Delete goal"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Expanded: tasks under this goal */}
                {isExpanded && (
                  <div style={{ padding: "0 20px 16px 54px", borderTop: "1px solid var(--border-color)" }}>
                    {goal.description && (
                      <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", padding: "12px 0 8px", lineHeight: 1.5 }}>
                        {goal.description}
                      </p>
                    )}
                    {goalTasks.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px", paddingTop: "8px" }}>
                        {goalTasks.map((task) => (
                          <TaskRow key={task.id} task={task} onToggle={() => toggleTask.mutate({ id: task.id, status: task.status })} />
                        ))}
                      </div>
                    ) : (
                      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", paddingTop: "8px" }}>
                        No tasks linked to this goal yet.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Unlinked Tasks */}
      {unlinkedTasks.length > 0 && (
        <div style={{ marginBottom: "32px" }}>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "12px", color: "var(--text-secondary)" }}>
            Standalone Tasks
          </h3>
          <div className="glass-card" style={{ padding: "16px 20px", cursor: "default" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {unlinkedTasks.map((task) => (
                <TaskRow key={task.id} task={task} onToggle={() => toggleTask.mutate({ id: task.id, status: task.status })} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Add Goal Modal */}
      {showAddGoal && (
        <Modal title="Add New Goal" onClose={() => setShowAddGoal(false)}>
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
              {createGoal.isPending ? "Creating..." : "Create Goal"}
            </button>
          </div>
        </Modal>
      )}

      {/* Add Task Modal */}
      {showAddTask && (
        <Modal title="Add New Task" onClose={() => setShowAddTask(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <input
              className="input-field" placeholder="What needs to be done?"
              value={newTask.title} onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
              autoFocus
            />
            <select
              className="input-field" value={newTask.goalId}
              onChange={(e) => setNewTask({ ...newTask, goalId: e.target.value })}
            >
              <option value="">No linked goal</option>
              {goals.filter((g) => g.status === "active").map((g) => (
                <option key={g.id} value={g.id}>{g.title}</option>
              ))}
            </select>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <input
                className="input-field" type="date" value={newTask.dueDate}
                onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
              />
              <select
                className="input-field" value={newTask.recurrence}
                onChange={(e) => setNewTask({ ...newTask, recurrence: e.target.value })}
              >
                <option value="">One-time</option>
                <option value="daily">Daily</option>
                <option value="weekdays">Weekdays</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
            <button
              className="btn-primary" style={{ width: "100%", marginTop: "4px" }}
              onClick={() => createTask.mutate()}
              disabled={!newTask.title || createTask.isPending}
            >
              {createTask.isPending ? "Creating..." : "Create Task"}
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
              value={newInitiative.targetDate}
              onChange={(e) => setNewInitiative({ ...newInitiative, targetDate: e.target.value })}
            />
            <button
              className="btn-primary"
              style={{ width: "100%", marginTop: "4px" }}
              onClick={() => createInitiative.mutate()}
              disabled={!newInitiative.title || createInitiative.isPending}
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
    </div>
  );
}

// ===== Sub-components =====

function TaskRow({ task, onToggle }: { task: Task; onToggle: () => void }) {
  const isCompleted = task.status === "completed";
  const isOverdue = !isCompleted && task.due_date && new Date(task.due_date) < new Date(new Date().toISOString().split("T")[0]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      <button
        onClick={onToggle}
        style={{
          background: "none", border: "none", cursor: "pointer", padding: 0,
          color: isCompleted ? "var(--accent-secondary)" : isOverdue ? "var(--accent-tertiary)" : "var(--text-muted)",
        }}
      >
        {isCompleted ? <CheckCircle2 size={18} /> : <Circle size={18} />}
      </button>
      <span style={{
        flex: 1, fontSize: "0.85rem",
        textDecoration: isCompleted ? "line-through" : "none",
        color: isCompleted ? "var(--text-muted)" : isOverdue ? "var(--accent-tertiary)" : "var(--text-primary)",
      }}>
        {task.title}
      </span>
      {task.recurrence && (
        <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", background: "var(--bg-glass)", padding: "2px 6px", borderRadius: 4 }}>
          {task.recurrence}
        </span>
      )}
      {task.due_date && (
        <span style={{
          fontSize: "0.7rem",
          color: isOverdue ? "var(--accent-tertiary)" : "var(--text-muted)",
        }}>
          {isOverdue && <AlertTriangle size={11} style={{ marginRight: 2 }} />}
          {new Date(task.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </span>
      )}
      {task.streak_count > 0 && (
        <span style={{ fontSize: "0.7rem", color: "var(--accent-warm)", display: "flex", alignItems: "center", gap: "2px" }}>
          <Flame size={12} /> {task.streak_count}
        </span>
      )}
    </div>
  );
}

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
