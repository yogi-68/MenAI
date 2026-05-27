"use client";

import { createClient } from "@/lib/supabase/client";
import { useAppStore } from "@/lib/store";
import { useQuery } from "@tanstack/react-query";
import { FileText, TrendingUp, Calendar, Eye, Target } from "lucide-react";

interface WeeklyReport {
  weekStart: string;
  weekEnd: string;
  goalsProgress: number;
  tasksCompleted: number;
  tasksTotal: number;
  dominantPattern: string | null;
  directionStability: string;
  executionTrend: string;
  keyInsight: string;
}

export default function ReportsPage() {
  const { user } = useAppStore();
  const supabase = createClient();

  const { data: weeklyReport, isLoading } = useQuery({
    queryKey: ["weekly-report"],
    queryFn: async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return null;

      // Calculate this week's date range
      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);

      const weekStartStr = weekStart.toISOString().split('T')[0];
      const weekEndStr = weekEnd.toISOString().split('T')[0];

      // Fetch data for this week
      const [tasksRes, goalsRes, patternsRes] = await Promise.allSettled([
        supabase
          .from("tasks")
          .select("status")
          .eq("user_id", authUser.id)
          .gte("created_at", weekStartStr)
          .lte("created_at", weekEndStr),
        supabase
          .from("goals")
          .select("status, progress")
          .eq("user_id", authUser.id),
        supabase
          .from("execution_patterns")
          .select("pattern, frequency, severity")
          .eq("user_id", authUser.id)
          .order("severity", { ascending: false })
          .limit(1),
      ]);

      const tasks = tasksRes.status === "fulfilled" ? (tasksRes.value.data || []) : [];
      const goals = goalsRes.status === "fulfilled" ? (goalsRes.value.data || []) : [];
      const patterns = patternsRes.status === "fulfilled" ? (patternsRes.value.data || []) : [];

      const tasksCompleted = tasks.filter((t: any) => t.status === "completed").length;
      const tasksTotal = tasks.length;
      const completionRate = tasksTotal > 0 ? (tasksCompleted / tasksTotal) * 100 : 0;

      const activeGoals = goals.filter((g: any) => g.status === "active").length;
      const goalsProgress = activeGoals > 0 ? 
        goals.reduce((sum: number, g: any) => sum + (g.progress || 0), 0) / activeGoals : 0;

      // Direction stability
      let directionStability = "Stable";
      if (activeGoals === 0) directionStability = "Unclear";
      else if (activeGoals > 5) directionStability = "Scattered";

      // Execution trend
      let executionTrend = "Building";
      if (completionRate >= 70) executionTrend = "Strong momentum";
      else if (completionRate >= 40) executionTrend = "Steady progress";
      else if (completionRate > 0) executionTrend = "Early momentum";
      else executionTrend = "Stalled";

      // Key insight
      let keyInsight = "";
      if (patterns.length > 0) {
        const pattern = patterns[0];
        keyInsight = `${pattern.pattern} pattern detected at ${pattern.severity} severity. ${pattern.frequency} occurrence.`;
      } else if (completionRate >= 70) {
        keyInsight = "Execution consistency maintained above 70%.";
      } else if (tasksTotal === 0) {
        keyInsight = "No execution data captured this week.";
      } else {
        keyInsight = `${completionRate.toFixed(0)}% task completion. Focus compression needed.`;
      }

      return {
        weekStart: weekStartStr,
        weekEnd: weekEndStr,
        goalsProgress,
        tasksCompleted,
        tasksTotal,
        dominantPattern: patterns.length > 0 ? patterns[0].pattern : null,
        directionStability,
        executionTrend,
        keyInsight,
      } as WeeklyReport;
    },
    staleTime: 60_000,
  });

  return (
    <div style={{ padding: "64px 48px", maxWidth: "1100px", margin: "0 auto", width: "100%" }}>
      {/* Header */}
      <div className="animate-fade-in" style={{ marginBottom: "72px" }}>
        <h1 style={{ fontSize: "2.5rem", fontWeight: 400, letterSpacing: "-0.03em", lineHeight: 1.2 }}>
          Trajectory Reports
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "1.1rem", marginTop: "12px", fontWeight: 300, lineHeight: 1.6 }}>
          Longitudinal synthesis of execution patterns and direction stability
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "40px" }}>
        
        {/* Weekly Report Header */}
        <section className="glass-card" style={{ padding: "40px", transition: "all 0.3s ease" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
            <FileText size={20} style={{ color: "var(--accent-primary)" }} />
            <h2 style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--accent-primary)", fontWeight: 500 }}>
              Weekly Report
            </h2>
          </div>
          
          {isLoading ? (
            <div className="skeleton shimmer" style={{ height: "100px", width: "100%", borderRadius: "8px" }} />
          ) : weeklyReport ? (
            <>
              <div style={{ fontSize: "0.9rem", color: "var(--text-muted)", marginBottom: "24px", fontWeight: 300 }}>
                {new Date(weeklyReport.weekStart).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} - {new Date(weeklyReport.weekEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "28px" }}>
                <div>
                  <div style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", marginBottom: "8px", fontWeight: 500 }}>
                    Execution
                  </div>
                  <div style={{ fontSize: "1.8rem", fontWeight: 300, color: "var(--text-primary)" }}>
                    {weeklyReport.tasksCompleted} / {weeklyReport.tasksTotal}
                  </div>
                  <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                    {weeklyReport.tasksTotal > 0 ? `${Math.round((weeklyReport.tasksCompleted / weeklyReport.tasksTotal) * 100)}% completion` : "No tasks"}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", marginBottom: "8px", fontWeight: 500 }}>
                    Direction
                  </div>
                  <div style={{ fontSize: "1.8rem", fontWeight: 300, color: "var(--text-primary)" }}>
                    {weeklyReport.directionStability}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", marginBottom: "8px", fontWeight: 500 }}>
                    Momentum
                  </div>
                  <div style={{ fontSize: "1.8rem", fontWeight: 300, color: "var(--text-primary)" }}>
                    {weeklyReport.executionTrend}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <p style={{ fontSize: "0.95rem", color: "var(--text-muted)", fontWeight: 300, lineHeight: 1.8 }}>
              Insufficient data for weekly synthesis.
            </p>
          )}
        </section>

        {/* Key Insight */}
        {weeklyReport?.keyInsight && (
          <section className="glass-card" style={{ padding: "40px", transition: "all 0.3s ease" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
              <Eye size={20} style={{ color: "var(--accent-secondary)" }} />
              <h2 style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--accent-secondary)", fontWeight: 500 }}>
                Key Observation
              </h2>
            </div>
            <p style={{ fontSize: "1rem", color: "var(--text-primary)", lineHeight: 1.8, fontWeight: 300 }}>
              {weeklyReport.keyInsight}
            </p>
          </section>
        )}

        {/* Dominant Pattern */}
        {weeklyReport?.dominantPattern && (
          <section className="glass-card" style={{ padding: "40px", transition: "all 0.3s ease" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
              <TrendingUp size={20} style={{ color: "var(--text-muted)" }} />
              <h2 style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-secondary)", fontWeight: 500 }}>
                Execution Pattern
              </h2>
            </div>
            <p style={{ fontSize: "1rem", color: "var(--text-primary)", lineHeight: 1.8, fontWeight: 300 }}>
              Dominant pattern: <span style={{ color: "var(--accent-primary)", fontWeight: 400 }}>{weeklyReport.dominantPattern}</span>
            </p>
          </section>
        )}

        {/* Coming Soon: Monthly Reports */}
        <section className="glass-card" style={{ padding: "40px", transition: "all 0.3s ease", opacity: 0.6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
            <Calendar size={20} style={{ color: "var(--text-muted)" }} />
            <h2 style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-secondary)", fontWeight: 500 }}>
              Monthly Report
            </h2>
          </div>
          <p style={{ fontSize: "0.95rem", color: "var(--text-muted)", fontWeight: 300, lineHeight: 1.8 }}>
            Monthly synthesis generates after 30 days of data.
          </p>
        </section>
      </div>
    </div>
  );
}
