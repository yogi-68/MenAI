"use client";

import { createClient } from "@/lib/supabase/client";
import { useAppStore } from "@/lib/store";
import { formatRelative } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  MessageCircleHeart,
  Target,
  Zap,
  BookHeart,
  CheckCircle2,
  Circle,
  Flame,
  AlertTriangle,
  Compass,
  ArrowRight,
  Sparkles,
  Lightbulb,
  ShieldCheck,
  Settings,
} from "lucide-react";

interface MoodEntry {
  id: string;
  mood_score: number;
  mood_label: string;
  created_at: string;
}

interface Goal {
  id: string;
  title: string;
  category: string;
  priority: string;
  progress: number;
  status: string;
}

interface TaskItem {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  streak_count: number;
}

interface Commitment {
  id: string;
  description: string;
  consistency_score: number;
  times_followed_through: number;
  times_broken: number;
  status: string;
}

export default function DashboardOverview() {
  const { user } = useAppStore();
  const supabase = createClient();
  const queryClient = useQueryClient();

  // Fetch dashboard data
  const { data, isLoading: loading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return null;

      const todayStr = new Date().toISOString().split("T")[0];

      const [
        goalsRes,
        tasksRes,
        commitmentsRes,
        moodRes,
        memoriesRes,
        journalInsightRes,
      ] = await Promise.all([
        supabase.from("goals").select("*").eq("user_id", authUser.id).eq("status", "active").order("priority", { ascending: false }),
        supabase.from("tasks").select("*").eq("user_id", authUser.id).in("status", ["pending", "in_progress"]).order("due_date", { ascending: true }),
        supabase.from("commitments").select("*").eq("user_id", authUser.id).eq("status", "active"),
        supabase.from("mood_entries").select("*").eq("user_id", authUser.id).order("created_at", { ascending: false }).limit(7),
        supabase.from("memories").select("content").eq("user_id", authUser.id).eq("memory_type", "insight").order("created_at", { ascending: false }).limit(1),
        supabase.from("journal_entries").select("ai_insight").eq("user_id", authUser.id).not("ai_insight", "is", null).order("created_at", { ascending: false }).limit(1),
      ]);

      const goals = (goalsRes.data || []) as Goal[];
      const tasks = (tasksRes.data || []) as TaskItem[];
      const commitments = (commitmentsRes.data || []) as Commitment[];
      const moods = (moodRes.data || []) as MoodEntry[];

      // Build one insight
      let latestInsight = "";
      if (memoriesRes.data && memoriesRes.data.length > 0) {
        latestInsight = memoriesRes.data[0].content;
      } else if (journalInsightRes.data && journalInsightRes.data.length > 0) {
        latestInsight = journalInsightRes.data[0].ai_insight || "";
      }

      // Calculate stats
      const avgProgress = goals.length > 0
        ? Math.round(goals.reduce((sum, g) => sum + (g.progress || 0), 0) / goals.length)
        : 0;

      const avgConsistency = commitments.length > 0
        ? Math.round(commitments.reduce((sum, c) => sum + (Number(c.consistency_score) || 0), 0) / commitments.length)
        : 0;

      const overdueTasks = tasks.filter(t => {
        if (!t.due_date) return false;
        return t.due_date < todayStr;
      });

      const latestEnergy = moods.length > 0 ? moods[0].mood_score : null;

      // Extract one accountability issue
      let accountabilityItem = null;
      if (overdueTasks.length > 0) {
        accountabilityItem = {
          type: "overdue",
          message: `Prioritize shipping: "${overdueTasks[0].title}" was due on ${overdueTasks[0].due_date}.`,
        };
      } else {
        const lowConsistencyCommitment = commitments.find(c => Number(c.consistency_score) < 60);
        if (lowConsistencyCommitment) {
          accountabilityItem = {
            type: "commitment",
            message: `Keep your promise: "${lowConsistencyCommitment.description}" consistency has dropped to ${lowConsistencyCommitment.consistency_score}%.`,
          };
        }
      }

      return {
        stats: {
          activeGoals: goals.length,
          pendingTasks: tasks.length,
          overdueTasks: overdueTasks.length,
          activeCommitments: commitments.length,
          avgConsistency,
          avgProgress,
          latestEnergy,
        },
        goals,
        tasks,
        commitments,
        latestInsight,
        accountabilityItem,
      };
    },
    staleTime: 30_000,
  });

  // Task Toggle Mutation
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
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });

  const stats = data?.stats || {
    activeGoals: 0, pendingTasks: 0, overdueTasks: 0,
    activeCommitments: 0, avgConsistency: 0, avgProgress: 0, latestEnergy: null,
  };
  const tasks = data?.tasks || [];
  const commitments = data?.commitments || [];
  const latestInsight = data?.latestInsight || "Your execution momentum is building. Focus on shipping micro-updates daily to maintain progress.";
  const accountabilityItem = data?.accountabilityItem;

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const todayStr = new Date().toISOString().split("T")[0];

  // Priorities for today: tasks due today or overdue, or in_progress
  const todayPriorities = tasks
    .filter(t => !t.due_date || t.due_date <= todayStr)
    .slice(0, 4);

  // Momentum formula
  const momentumScore = Math.round(
    (stats.avgProgress * 0.3) +
    (stats.avgConsistency * 0.4) +
    ((1 - (stats.overdueTasks / Math.max(stats.pendingTasks, 1))) * 100 * 0.2) +
    ((stats.latestEnergy || 5) * 10 * 0.1)
  );

  const momentumColor = momentumScore > 70 ? "var(--accent-secondary)" : momentumScore > 40 ? "var(--accent-warm)" : "var(--accent-tertiary)";
  const momentumLabel = momentumScore > 70 ? "Strong Focus" : momentumScore > 40 ? "Building Pace" : "Restructuring Needed";

  return (
    <div style={{ padding: "40px 32px", maxWidth: "900px", margin: "0 auto" }}>
      {/* ===== HEADER ===== */}
      <div className="animate-fade-in" style={{ marginBottom: "40px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <span style={{ fontSize: "0.82rem", color: "var(--accent-primary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.15em" }}>
            Life OS • Command Center
          </span>
          <h1 style={{ fontSize: "2.2rem", fontWeight: 800, marginTop: "6px", letterSpacing: "-0.02em" }}>
            {greeting()}, <span className="gradient-text">{user?.full_name?.split(" ")[0] || "Builder"}</span>
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "1rem", marginTop: "4px" }}>
            Here is your focus roadmap for today.
          </p>
        </div>
        <div style={{ color: "var(--text-muted)", fontSize: "0.9rem", fontWeight: 500 }}>
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
        </div>
      </div>

      {/* ===== MAIN GRID (Today's Priorities + Momentum) ===== */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: "24px", marginBottom: "32px" }}>
        
        {/* Today's Priorities */}
        <div className="glass-card" style={{ padding: "28px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
                <CheckCircle2 size={18} style={{ color: "var(--accent-secondary)" }} />
                Today&apos;s Focus Tasks
              </h2>
              <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 500 }}>
                {todayPriorities.length} items
              </span>
            </div>

            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div className="skeleton" style={{ height: "40px", width: "100%" }} />
                <div className="skeleton" style={{ height: "40px", width: "100%" }} />
              </div>
            ) : todayPriorities.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {todayPriorities.map((task) => {
                  const isOverdue = task.due_date && task.due_date < todayStr;
                  return (
                    <div
                      key={task.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        padding: "10px 14px",
                        background: "rgba(255, 255, 255, 0.02)",
                        border: "1px solid var(--border-color)",
                        borderRadius: "var(--radius-md)",
                        transition: "all 0.2s ease",
                      }}
                    >
                      <button
                        onClick={() => toggleTask.mutate({ id: task.id, status: task.status })}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                          color: "var(--text-muted)",
                          display: "flex",
                          alignItems: "center",
                        }}
                      >
                        <Circle size={18} />
                      </button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: "0.9rem", fontWeight: 500, color: isOverdue ? "var(--accent-tertiary)" : "var(--text-primary)" }}>
                          {task.title}
                        </span>
                        {isOverdue && (
                          <span style={{ display: "block", fontSize: "0.7rem", color: "var(--accent-tertiary)", marginTop: "2px", fontWeight: 600 }}>
                            Overdue focus item
                          </span>
                        )}
                      </div>
                      {task.streak_count > 0 && (
                        <div style={{ display: "flex", alignItems: "center", gap: "3px", fontSize: "0.78rem", color: "var(--accent-warm)", fontWeight: 600 }}>
                          <Flame size={12} /> {task.streak_count}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "36px 20px", color: "var(--text-muted)" }}>
                <ShieldCheck size={36} style={{ opacity: 0.2, marginBottom: "10px" }} />
                <p style={{ fontSize: "0.88rem", fontWeight: 500 }}>All priority tasks for today completed.</p>
                <p style={{ fontSize: "0.78rem", marginTop: "4px" }}>Talk to your AI mentor to plan your next sprints.</p>
              </div>
            )}
          </div>

          <div style={{ marginTop: "24px", borderTop: "1px solid var(--border-color)", paddingTop: "16px" }}>
            <Link
              href="/dashboard/goals"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "0.85rem",
                color: "var(--accent-primary)",
                textDecoration: "none",
                fontWeight: 600,
                transition: "gap 0.2s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.gap = "10px"; }}
              onMouseLeave={(e) => { e.currentTarget.style.gap = "6px"; }}
            >
              Add or manage all tasks <ArrowRight size={14} />
            </Link>
          </div>
        </div>

        {/* Momentum Gauge */}
        <div className="glass-card" style={{ padding: "28px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: "16px" }}>
            Execution Momentum
          </span>

          <div style={{
            width: 130,
            height: 130,
            borderRadius: "50%",
            background: `conic-gradient(${momentumColor} ${momentumScore * 3.6}deg, var(--bg-glass) 0deg)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            marginBottom: "16px",
            boxShadow: "var(--shadow-sm)",
          }}>
            <div style={{
              width: 108,
              height: 108,
              borderRadius: "50%",
              background: "var(--bg-secondary)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
            }}>
              <span style={{ fontSize: "2rem", fontWeight: 800, color: "var(--text-primary)", lineHeight: 1 }}>
                {loading ? "—" : momentumScore}
              </span>
              <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: "4px", textTransform: "uppercase", fontWeight: 600 }}>
                Score
              </span>
            </div>
          </div>

          <div style={{ fontSize: "0.95rem", fontWeight: 700, color: momentumColor }}>
            {momentumLabel}
          </div>
          
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "6px", maxWidth: "160px", lineHeight: 1.4 }}>
            Active goals: {stats.activeGoals} • Commitments: {stats.activeCommitments}
          </div>
        </div>
      </div>

      {/* ===== INSIGHT & ACCOUNTABILITY BLOCK ===== */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginBottom: "36px" }}>
        
        {/* One Insight */}
        <div className="glass-card" style={{ padding: "24px", background: "linear-gradient(135deg, rgba(124, 92, 252, 0.04), rgba(255, 255, 255, 0.01))" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
            <Lightbulb size={16} style={{ color: "var(--accent-primary)" }} />
            <h3 style={{ fontSize: "0.95rem", fontWeight: 700 }}>Today&apos;s Strategist Insight</h3>
          </div>
          <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.6, fontStyle: "italic" }}>
            &ldquo;{latestInsight}&rdquo;
          </p>
        </div>

        {/* One Accountability */}
        <div className="glass-card" style={{ padding: "24px", background: "linear-gradient(135deg, rgba(252, 92, 156, 0.03), rgba(255, 255, 255, 0.01))" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
            <Compass size={16} style={{ color: "var(--accent-tertiary)" }} />
            <h3 style={{ fontSize: "0.95rem", fontWeight: 700 }}>Accountability Radar</h3>
          </div>
          {accountabilityItem ? (
            <div>
              <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "12px" }}>
                {accountabilityItem.message}
              </p>
              <Link
                href="/dashboard/chat"
                style={{ fontSize: "0.78rem", color: "var(--accent-tertiary)", fontWeight: 600, textDecoration: "none", display: "flex", alignItems: "center", gap: "4px" }}
              >
                Resolve with AI Mentor <ArrowRight size={12} />
              </Link>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                Radar clear. All active commitments and task deadlines are currently consistent and tracked. No bottlenecks detected.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ===== PROGRESSIVE DISCOVERY NAVIGATION ===== */}
      <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "28px" }}>
        <h3 style={{ fontSize: "0.82rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600, marginBottom: "16px" }}>
          Life OS Systems
        </h3>
        
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px" }}>
          <Link
            href="/dashboard/chat"
            className="glass-card"
            style={{
              padding: "16px 20px",
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              transition: "transform 0.2s, background 0.2s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <MessageCircleHeart size={16} style={{ color: "var(--accent-primary)" }} />
              <div>
                <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--text-primary)" }}>AI Mentor</div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>Coaching & Alignment</div>
              </div>
            </div>
            <ArrowRight size={14} style={{ color: "var(--text-muted)" }} />
          </Link>

          <Link
            href="/dashboard/status"
            className="glass-card"
            style={{
              padding: "16px 20px",
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              transition: "transform 0.2s, background 0.2s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <Compass size={16} style={{ color: "var(--accent-secondary)" }} />
              <div>
                <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--text-primary)" }}>Life Status</div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>Metrics & Commitments</div>
              </div>
            </div>
            <ArrowRight size={14} style={{ color: "var(--text-muted)" }} />
          </Link>

          <Link
            href="/dashboard/journal"
            className="glass-card"
            style={{
              padding: "16px 20px",
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              transition: "transform 0.2s, background 0.2s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <BookHeart size={16} style={{ color: "var(--accent-warm)" }} />
              <div>
                <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--text-primary)" }}>Reflections</div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>Process Thinking Patterns</div>
              </div>
            </div>
            <ArrowRight size={14} style={{ color: "var(--text-muted)" }} />
          </Link>

          <Link
            href="/dashboard/settings"
            className="glass-card"
            style={{
              padding: "16px 20px",
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              transition: "transform 0.2s, background 0.2s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <Settings size={16} style={{ color: "var(--text-muted)" }} />
              <div>
                <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--text-primary)" }}>Settings</div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>Founder Mode & Style</div>
              </div>
            </div>
            <ArrowRight size={14} style={{ color: "var(--text-muted)" }} />
          </Link>
        </div>
      </div>
    </div>
  );
}
