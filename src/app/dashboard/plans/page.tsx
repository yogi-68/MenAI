"use client";

import { createClient } from "@/lib/supabase/client";
import { useAppStore } from "@/lib/store";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Calendar, CheckCircle2, Circle, Sparkles, TrendingUp } from "lucide-react";

interface DailyPlan {
  id: string;
  plan_date: string;
  plan_content: {
    focusAreas: string[];
    tasks: Array<{ title: string; reason: string; priority: string }>;
    aiNotes: string;
  };
  completion_score: number | null;
  energy_level: number | null;
}

interface Task {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
}

export default function DailyPlansPage() {
  const { user } = useAppStore();
  const supabase = createClient();
  const queryClient = useQueryClient();

  const { data: todayPlan, isLoading } = useQuery({
    queryKey: ["daily-plan", new Date().toISOString().split('T')[0]],
    queryFn: async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return null;

      const today = new Date().toISOString().split('T')[0];

      const { data } = await supabase
        .from("daily_plans")
        .select("*")
        .eq("user_id", authUser.id)
        .eq("plan_date", today)
        .single();

      return data as DailyPlan | null;
    },
    staleTime: 60_000,
  });

  const { data: tasks } = useQuery({
    queryKey: ["today-tasks"],
    queryFn: async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return [];

      const today = new Date().toISOString().split('T')[0];

      const { data } = await supabase
        .from("tasks")
        .select("*")
        .eq("user_id", authUser.id)
        .eq("due_date", today)
        .order("created_at", { ascending: true });

      return (data || []) as Task[];
    },
    staleTime: 30_000,
  });

  const generatePlan = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/plans/generate", {
        method: "POST",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["daily-plan"] });
      queryClient.invalidateQueries({ queryKey: ["today-tasks"] });
    },
  });

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
      queryClient.invalidateQueries({ queryKey: ["today-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["daily-plan"] });
    },
  });

  const completedTasks = tasks?.filter(t => t.status === "completed").length || 0;
  const totalTasks = tasks?.length || 0;
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <div style={{ padding: "64px 48px", maxWidth: "1100px", margin: "0 auto", width: "100%" }}>
      {/* Header */}
      <div className="animate-fade-in" style={{ marginBottom: "72px" }}>
        <h1 style={{ fontSize: "2.5rem", fontWeight: 400, letterSpacing: "-0.03em", lineHeight: 1.2 }}>
          Today's Plan
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "1.1rem", marginTop: "12px", fontWeight: 300, lineHeight: 1.6 }}>
          Adaptive execution plan for {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "40px" }}>
        
        {/* Completion Overview */}
        {totalTasks > 0 && (
          <section className="glass-card" style={{ padding: "32px 40px", transition: "all 0.3s ease" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "24px" }}>
              <div>
                <div style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", marginBottom: "8px", fontWeight: 500 }}>
                  Execution Progress
                </div>
                <div style={{ fontSize: "2rem", fontWeight: 300, color: "var(--text-primary)" }}>
                  {completedTasks} / {totalTasks}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", marginBottom: "8px", fontWeight: 500 }}>
                  Completion
                </div>
                <div style={{ fontSize: "2rem", fontWeight: 300, color: completionRate >= 70 ? "var(--accent-primary)" : "var(--text-primary)" }}>
                  {completionRate}%
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Focus Areas */}
        {todayPlan?.plan_content?.focusAreas && todayPlan.plan_content.focusAreas.length > 0 && (
          <section className="glass-card" style={{ padding: "40px", transition: "all 0.3s ease" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
              <TrendingUp size={20} style={{ color: "var(--accent-primary)" }} />
              <h2 style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--accent-primary)", fontWeight: 500 }}>
                Focus Areas
              </h2>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {todayPlan.plan_content.focusAreas.map((area, idx) => (
                <div key={idx} style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                  <span style={{ fontSize: "0.85rem", color: "var(--accent-primary)", fontWeight: 500, marginTop: "2px" }}>
                    {idx + 1}.
                  </span>
                  <span style={{ fontSize: "0.95rem", color: "var(--text-primary)", lineHeight: 1.7, fontWeight: 300 }}>
                    {area}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Tasks */}
        <section className="glass-card" style={{ padding: "40px", transition: "all 0.3s ease" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "28px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <Calendar size={20} style={{ color: "var(--text-muted)" }} />
              <h2 style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-secondary)", fontWeight: 500 }}>
                Execution Items
              </h2>
            </div>
            <button
              onClick={() => generatePlan.mutate()}
              disabled={generatePlan.isPending}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 20px",
                borderRadius: "var(--radius-full)",
                background: "var(--bg-glass)",
                border: "1px solid var(--border-color)",
                color: "var(--text-primary)",
                cursor: generatePlan.isPending ? "wait" : "pointer",
                fontSize: "0.85rem",
                fontWeight: 500,
                transition: "all 0.25s ease",
              }}
              onMouseEnter={(e) => {
                if (!generatePlan.isPending) {
                  e.currentTarget.style.borderColor = "var(--accent-primary)";
                  e.currentTarget.style.background = "rgba(59, 130, 246, 0.1)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border-color)";
                e.currentTarget.style.background = "var(--bg-glass)";
              }}
            >
              <Sparkles size={14} />
              {generatePlan.isPending ? "Generating..." : "Generate Plan"}
            </button>
          </div>

          {isLoading ? (
            <div className="skeleton shimmer" style={{ height: "200px", width: "100%", borderRadius: "8px" }} />
          ) : tasks && tasks.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              {tasks.map(task => (
                <div key={task.id} style={{ display: "flex", alignItems: "flex-start", gap: "14px", padding: "16px", borderRadius: "var(--radius-md)", background: task.status === "completed" ? "rgba(59, 130, 246, 0.05)" : "transparent", transition: "all 0.3s ease" }}>
                  <button
                    onClick={() => toggleTask.mutate({ id: task.id, status: task.status })}
                    style={{
                      marginTop: "2px",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                      color: task.status === "completed" ? "var(--accent-primary)" : "var(--text-muted)",
                      transition: "all 0.25s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "scale(1.1)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "scale(1)";
                    }}
                  >
                    {task.status === "completed" ? (
                      <CheckCircle2 size={20} />
                    ) : (
                      <Circle size={20} />
                    )}
                  </button>
                  <span style={{
                    fontSize: "0.95rem",
                    color: task.status === "completed" ? "var(--text-muted)" : "var(--text-primary)",
                    fontWeight: 300,
                    lineHeight: 1.7,
                    textDecoration: task.status === "completed" ? "line-through" : "none",
                  }}>
                    {task.title}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: "0.95rem", color: "var(--text-muted)", fontWeight: 300, lineHeight: 1.8, textAlign: "center", padding: "40px 0" }}>
              No tasks scheduled for today.
            </p>
          )}
        </section>

        {/* AI Notes */}
        {todayPlan?.plan_content?.aiNotes && (
          <section className="glass-card" style={{ padding: "40px", transition: "all 0.3s ease" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
              <Sparkles size={20} style={{ color: "var(--accent-secondary)" }} />
              <h2 style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--accent-secondary)", fontWeight: 500 }}>
                AI Synthesis
              </h2>
            </div>
            <p style={{ fontSize: "0.95rem", color: "var(--text-primary)", lineHeight: 1.8, fontWeight: 300 }}>
              {todayPlan.plan_content.aiNotes}
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
