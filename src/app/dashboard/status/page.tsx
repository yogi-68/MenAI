"use client";

import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";
import {
  Compass,
  Flame,
  Target,
  Users,
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
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

      const [goalsRes, commitmentsRes, relationshipsRes, accountabilityRes] = await Promise.all([
        supabase.from("goals").select("*").eq("user_id", user.id).eq("status", "active").order("priority", { ascending: false }),
        supabase.from("commitments").select("*").eq("user_id", user.id).eq("status", "active").order("created_at", { ascending: false }),
        supabase.from("relationships").select("*").eq("user_id", user.id).order("last_mentioned_at", { ascending: false }).limit(15),
        supabase.from("accountability_log").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
      ]);

      return {
        goals: (goalsRes.data || []) as Goal[],
        commitments: (commitmentsRes.data || []) as Commitment[],
        relationships: (relationshipsRes.data || []) as Relationship[],
        accountability: (accountabilityRes.data || []) as AccountabilityEntry[],
      };
    },
    staleTime: 60_000,
  });

  const goals = data?.goals || [];
  const commitments = data?.commitments || [];
  const relationships = data?.relationships || [];
  const accountability = data?.accountability || [];

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
    <div style={{ padding: "32px", maxWidth: "900px", margin: "0 auto" }}>
      {/* Header */}
      <div className="animate-fade-in" style={{ marginBottom: "32px" }}>
        <h1 style={{ fontSize: "1.6rem", fontWeight: 700, marginBottom: "6px", display: "flex", alignItems: "center", gap: "10px" }}>
          <Compass size={24} style={{ color: "var(--accent-primary)" }} />
          Life Status
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.88rem" }}>
          Everything here is derived from your conversations. Talk to MenAI to build this view.
        </p>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div className="skeleton" style={{ height: "120px", width: "100%" }} />
          <div className="skeleton" style={{ height: "120px", width: "100%" }} />
        </div>
      )}

      {/* Real Content — Only renders sections that have data */}
      {!isLoading && (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

          {/* Commitments */}
          <div className="glass-card" style={{ padding: "24px", cursor: "default" }}>
            <h3 style={{ fontSize: "1.05rem", fontWeight: 600, marginBottom: "18px", display: "flex", alignItems: "center", gap: "8px" }}>
              <Flame size={18} style={{ color: "var(--accent-warm)" }} />
              Active Commitments
            </h3>
            {commitments.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {commitments.map((c) => {
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
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                No promises tracked yet. Make a commitment in conversation and MenAI will hold you to it.
              </p>
            )}
          </div>

          {/* People */}
          <div className="glass-card" style={{ padding: "24px", cursor: "default" }}>
            <h3 style={{ fontSize: "1.05rem", fontWeight: 600, marginBottom: "18px", display: "flex", alignItems: "center", gap: "8px" }}>
              <Users size={18} style={{ color: "#fc5c9c" }} />
              People in Your Life
            </h3>
            {relationships.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                {relationships.map((r) => (
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
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                No meaningful relationships referenced yet. Mention someone by name in your conversations.
              </p>
            )}
          </div>

          {/* Goal Progress — only if goals exist */}
          {goals.length > 0 && (
            <div className="glass-card" style={{ padding: "24px", cursor: "default" }}>
              <h3 style={{ fontSize: "1.05rem", fontWeight: 600, marginBottom: "18px", display: "flex", alignItems: "center", gap: "8px" }}>
                <Target size={18} style={{ color: "var(--accent-primary)" }} />
                Goal Progress
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {goals.map((g) => {
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

          {/* No goals message */}
          {goals.length === 0 && (
            <div className="glass-card" style={{ padding: "24px", cursor: "default" }}>
              <h3 style={{ fontSize: "1.05rem", fontWeight: 600, marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                <Target size={18} style={{ color: "var(--accent-primary)" }} />
                Goals
              </h3>
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                No committed long-term goals identified yet. Share what you&apos;re working toward in conversation.
              </p>
            </div>
          )}

          {/* Recent Accountability — only if entries exist */}
          {accountability.length > 0 && (
            <div className="glass-card" style={{ padding: "24px", cursor: "default" }}>
              <h3 style={{ fontSize: "1.05rem", fontWeight: 600, marginBottom: "18px", display: "flex", alignItems: "center", gap: "8px" }}>
                <Activity size={18} style={{ color: "var(--accent-secondary)" }} />
                Recent Accountability
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {accountability.slice(0, 10).map((entry) => {
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
      )}
    </div>
  );
}
