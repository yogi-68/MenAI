"use client";

import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";
import {
  Compass,
  Flame,
  Target,
  Users,
  TrendingUp,
  TrendingDown,
  Activity,
  Zap,
  CheckCircle2,
  XCircle,
  Clock,
  BarChart3,
} from "lucide-react";

interface Commitment {
  id: string;
  description: string;
  category: string;
  consistency_score: number;
  times_followed_through: number;
  times_broken: number;
  created_at: string;
}

interface Relationship {
  id: string;
  name: string;
  role: string;
  emotional_closeness: number | null;
  notes: string | null;
  last_mentioned_at: string;
}

interface Goal {
  id: string;
  title: string;
  category: string;
  progress: number;
  status: string;
}

interface AccountabilityEntry {
  id: string;
  action: string;
  ai_observation: string | null;
  created_at: string;
}

export default function StatusPage() {
  const supabase = createClient();

  const { data, isLoading } = useQuery({
    queryKey: ["life-status"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const [goalsRes, commitmentsRes, relationshipsRes, accountabilityRes, tasksRes] = await Promise.all([
        supabase.from("goals").select("*").eq("user_id", user.id).eq("status", "active").order("priority", { ascending: false }),
        supabase.from("commitments").select("*").eq("user_id", user.id).eq("status", "active").order("created_at", { ascending: false }),
        supabase.from("relationships").select("*").eq("user_id", user.id).order("last_mentioned_at", { ascending: false }).limit(15),
        supabase.from("accountability_log").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
        supabase.from("tasks").select("id, status").eq("user_id", user.id),
      ]);

      const goals = (goalsRes.data || []) as Goal[];
      const commitments = (commitmentsRes.data || []) as Commitment[];
      const relationships = (relationshipsRes.data || []) as Relationship[];
      const accountability = (accountabilityRes.data || []) as AccountabilityEntry[];
      const allTasks = (tasksRes.data || []) as { id: string; status: string }[];

      const completedTasks = allTasks.filter(t => t.status === "completed").length;
      const totalTasks = allTasks.length;

      return {
        goals,
        commitments,
        relationships,
        accountability,
        stats: {
          goalCount: goals.length,
          avgGoalProgress: goals.length > 0 ? Math.round(goals.reduce((s, g) => s + g.progress, 0) / goals.length) : 0,
          commitmentCount: commitments.length,
          avgConsistency: commitments.length > 0 ? Math.round(commitments.reduce((s, c) => s + Number(c.consistency_score), 0) / commitments.length) : 0,
          relationshipCount: relationships.length,
          taskCompletion: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
          followedThrough: accountability.filter(a => a.action === "followed_through").length,
          missed: accountability.filter(a => a.action === "missed").length,
        },
      };
    },
    staleTime: 60_000,
  });

  const stats = data?.stats || { goalCount: 0, avgGoalProgress: 0, commitmentCount: 0, avgConsistency: 0, relationshipCount: 0, taskCompletion: 0, followedThrough: 0, missed: 0 };

  const categoryColors: Record<string, string> = {
    health: "#5ce0d8",
    work: "#7c5cfc",
    relationships: "#fc5c9c",
    personal: "#fcb05c",
    other: "#888",
    partner: "#fc5c9c",
    parent: "#fcb05c",
    friend: "#5c8cfc",
    mentor: "#7c5cfc",
    coworker: "#5ce0d8",
  };

  return (
    <div style={{ padding: "32px", maxWidth: "1100px", margin: "0 auto" }}>
      {/* Header */}
      <div className="animate-fade-in" style={{ marginBottom: "32px" }}>
        <h1 style={{ fontSize: "1.8rem", fontWeight: 700, marginBottom: "6px", display: "flex", alignItems: "center", gap: "10px" }}>
          <Compass size={28} style={{ color: "var(--accent-primary)" }} />
          Life Status
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>
          A holistic view of your life systems — commitments, people, patterns, and execution.
        </p>
      </div>

      {/* Summary Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px", marginBottom: "28px" }}>
        {[
          { icon: Target, label: "Goals", value: stats.goalCount, sub: `${stats.avgGoalProgress}% avg progress`, color: "var(--accent-primary)" },
          { icon: Flame, label: "Consistency", value: `${stats.avgConsistency}%`, sub: `${stats.commitmentCount} commitments`, color: "var(--accent-warm)" },
          { icon: BarChart3, label: "Task Rate", value: `${stats.taskCompletion}%`, sub: "completion rate", color: "var(--accent-secondary)" },
          { icon: Users, label: "People", value: stats.relationshipCount, sub: "in your circle", color: "#fc5c9c" },
          { icon: CheckCircle2, label: "Followed", value: stats.followedThrough, sub: "commitments kept", color: "var(--accent-secondary)" },
          { icon: XCircle, label: "Missed", value: stats.missed, sub: "commitments broken", color: "var(--accent-tertiary)" },
        ].map((s) => (
          <div key={s.label} className="glass-card" style={{ padding: "16px", cursor: "default" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <s.icon size={15} style={{ color: s.color }} />
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{s.label}</span>
            </div>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "2px" }}>
              {isLoading ? <div className="skeleton" style={{ width: "40px", height: "24px" }} /> : s.value}
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "28px" }}>
        {/* Commitments */}
        <div className="glass-card" style={{ padding: "24px", cursor: "default" }}>
          <h3 style={{ fontSize: "1.05rem", fontWeight: 600, marginBottom: "18px", display: "flex", alignItems: "center", gap: "8px" }}>
            <Flame size={18} style={{ color: "var(--accent-warm)" }} />
            Active Commitments
          </h3>
          {(data?.commitments || []).length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {(data?.commitments || []).map((c) => {
                const score = Number(c.consistency_score) || 0;
                const scoreColor = score > 70 ? "var(--accent-secondary)" : score > 40 ? "var(--accent-warm)" : "var(--accent-tertiary)";
                return (
                  <div key={c.id}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <span style={{ fontSize: "0.88rem", fontWeight: 500, flex: 1 }}>{c.description}</span>
                      <span style={{ fontSize: "0.82rem", fontWeight: 700, color: scoreColor, marginLeft: "12px" }}>{score}%</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{ flex: 1, height: 4, borderRadius: 2, background: "var(--bg-glass)" }}>
                        <div style={{ width: `${score}%`, height: "100%", borderRadius: 2, background: scoreColor, transition: "width 0.5s ease" }} />
                      </div>
                      <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                        {c.times_followed_through}✓ / {c.times_broken}✗
                      </span>
                    </div>
                    {c.category && (
                      <span style={{
                        fontSize: "0.65rem", color: categoryColors[c.category] || "var(--text-muted)",
                        textTransform: "capitalize", marginTop: "4px", display: "inline-block",
                      }}>
                        {c.category}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "24px", color: "var(--text-muted)" }}>
              <Flame size={28} style={{ opacity: 0.3, marginBottom: "8px" }} />
              <p style={{ fontSize: "0.85rem" }}>No commitments yet. Make a promise in your next chat session.</p>
            </div>
          )}
        </div>

        {/* Relationships */}
        <div className="glass-card" style={{ padding: "24px", cursor: "default" }}>
          <h3 style={{ fontSize: "1.05rem", fontWeight: 600, marginBottom: "18px", display: "flex", alignItems: "center", gap: "8px" }}>
            <Users size={18} style={{ color: "#fc5c9c" }} />
            People in Your Life
          </h3>
          {(data?.relationships || []).length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
              {(data?.relationships || []).map((r) => (
                <div
                  key={r.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "8px 14px",
                    borderRadius: "var(--radius-full)",
                    background: "var(--bg-glass)",
                    border: "1px solid var(--border-color)",
                  }}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%",
                    background: categoryColors[r.role] || "var(--accent-primary)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "0.7rem", fontWeight: 700, color: "white",
                  }}>
                    {r.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: "0.82rem", fontWeight: 600 }}>{r.name}</div>
                    <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", textTransform: "capitalize" }}>{r.role}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "24px", color: "var(--text-muted)" }}>
              <Users size={28} style={{ opacity: 0.3, marginBottom: "8px" }} />
              <p style={{ fontSize: "0.85rem" }}>No people tracked yet. Mention someone by name in your chats.</p>
            </div>
          )}
        </div>
      </div>

      {/* Goal Progress Overview */}
      {(data?.goals || []).length > 0 && (
        <div className="glass-card" style={{ padding: "24px", cursor: "default", marginBottom: "28px" }}>
          <h3 style={{ fontSize: "1.05rem", fontWeight: 600, marginBottom: "18px", display: "flex", alignItems: "center", gap: "8px" }}>
            <Target size={18} style={{ color: "var(--accent-primary)" }} />
            Goal Progress
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {(data?.goals || []).map((g) => {
              const catColor = categoryColors[g.category] || "var(--accent-primary)";
              return (
                <div key={g.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: catColor }} />
                      <span style={{ fontSize: "0.9rem", fontWeight: 500 }}>{g.title}</span>
                    </div>
                    <span style={{ fontSize: "0.85rem", fontWeight: 700 }}>{g.progress}%</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: "var(--bg-glass)" }}>
                    <div style={{
                      width: `${g.progress}%`, height: "100%", borderRadius: 3,
                      background: `linear-gradient(90deg, ${catColor}, ${catColor}aa)`,
                      transition: "width 0.8s ease",
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Accountability Events */}
      {(data?.accountability || []).length > 0 && (
        <div className="glass-card" style={{ padding: "24px", cursor: "default" }}>
          <h3 style={{ fontSize: "1.05rem", fontWeight: 600, marginBottom: "18px", display: "flex", alignItems: "center", gap: "8px" }}>
            <Activity size={18} style={{ color: "var(--accent-secondary)" }} />
            Recent Accountability
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {(data?.accountability || []).slice(0, 10).map((entry) => {
              const actionColors: Record<string, { color: string; icon: typeof CheckCircle2 }> = {
                followed_through: { color: "var(--accent-secondary)", icon: CheckCircle2 },
                missed: { color: "var(--accent-tertiary)", icon: XCircle },
                partial: { color: "var(--accent-warm)", icon: Clock },
                rescheduled: { color: "var(--text-muted)", icon: Clock },
              };
              const config = actionColors[entry.action] || actionColors.partial;
              const Icon = config.icon;
              return (
                <div key={entry.id} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <Icon size={16} style={{ color: config.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                    {entry.ai_observation || entry.action.replace("_", " ")}
                  </span>
                  <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                    {new Date(entry.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
