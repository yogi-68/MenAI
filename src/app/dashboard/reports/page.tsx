"use client";

import { useQuery } from "@tanstack/react-query";
import { FileText, TrendingUp, Target, AlertTriangle, Sparkles, RefreshCw } from "lucide-react";

interface WeeklyReview {
  biggestWin: string;
  biggestBottleneck: string;
  initiativeHealthChanges: string[];
  lifeAreaDistribution: string;
  opportunitiesSummary: string;
  focusRecommendation: string;
  executionSummary: string;
  momentumScore: number;
  narrative: string;
}

export default function ReportsPage() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["weekly-review-ai"],
    queryFn: async () => {
      const res = await fetch("/api/reports/weekly");
      if (!res.ok) throw new Error("Failed to load review");
      return res.json() as Promise<{
        review: WeeklyReview;
        weekStart: string;
        weekEnd: string;
        cached: boolean;
      }>;
    },
    staleTime: 10 * 60_000,
    retry: 1,
  });

  const review = data?.review;

  return (
    <div className="page-shell">
      <div className="animate-fade-in" style={{ marginBottom: "48px" }}>
        <h1 style={{ fontSize: "2.5rem", fontWeight: 400, letterSpacing: "-0.03em", lineHeight: 1.2 }}>
          Weekly Review
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "1.1rem", marginTop: "12px", fontWeight: 300, lineHeight: 1.6 }}>
          Strategic guidance from your execution data — not a task count report.
        </p>
        {data && (
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: "8px" }}>
            {new Date(data.weekStart).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            {" – "}
            {new Date(data.weekEnd).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            {data.cached && " · cached"}
          </p>
        )}
      </div>

      {isLoading ? (
        <div className="skeleton shimmer" style={{ height: "400px", borderRadius: "12px" }} />
      ) : review ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
          <section className="glass-card" style={{ padding: "32px 36px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px", marginBottom: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <TrendingUp size={18} style={{ color: "var(--accent-primary)" }} />
                <span style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>
                  Momentum score
                </span>
              </div>
              <span style={{ fontSize: "2rem", fontWeight: 300, color: "var(--accent-primary)" }}>{review.momentumScore}</span>
            </div>
            <p style={{ fontSize: "1.05rem", lineHeight: 1.8, color: "var(--text-primary)", fontWeight: 300 }}>
              {review.narrative}
            </p>
            <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginTop: "12px" }}>{review.executionSummary}</p>
          </section>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "24px" }}>
            <section className="glass-card" style={{ padding: "28px 32px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
                <Sparkles size={16} style={{ color: "var(--accent-secondary)" }} />
                <h2 style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>Biggest win</h2>
              </div>
              <p style={{ fontSize: "0.95rem", lineHeight: 1.7, color: "var(--text-primary)" }}>{review.biggestWin}</p>
            </section>

            <section className="glass-card" style={{ padding: "28px 32px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
                <AlertTriangle size={16} style={{ color: "#f59e0b" }} />
                <h2 style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>Biggest bottleneck</h2>
              </div>
              <p style={{ fontSize: "0.95rem", lineHeight: 1.7, color: "var(--text-primary)" }}>{review.biggestBottleneck}</p>
            </section>
          </div>

          {review.initiativeHealthChanges.length > 0 && (
            <section className="glass-card" style={{ padding: "28px 32px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
                <Target size={16} style={{ color: "var(--text-muted)" }} />
                <h2 style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>Initiative health</h2>
              </div>
              {review.initiativeHealthChanges.map((item) => (
                <p key={item} style={{ fontSize: "0.9rem", color: "var(--text-secondary)", margin: "0 0 6px" }}>· {item}</p>
              ))}
            </section>
          )}

          <section className="glass-card" style={{ padding: "28px 32px" }}>
            <h2 style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "14px" }}>Life area distribution</h2>
            <p style={{ fontSize: "0.95rem", lineHeight: 1.7, color: "var(--text-secondary)" }}>{review.lifeAreaDistribution}</p>
          </section>

          <section className="glass-card" style={{ padding: "28px 32px" }}>
            <h2 style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "14px" }}>Opportunities</h2>
            <p style={{ fontSize: "0.95rem", lineHeight: 1.7, color: "var(--text-secondary)" }}>{review.opportunitiesSummary}</p>
          </section>

          <section className="glass-card" style={{ padding: "32px 36px", borderLeft: "3px solid var(--accent-primary)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
              <FileText size={16} style={{ color: "var(--accent-primary)" }} />
              <h2 style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--accent-primary)" }}>Focus next week</h2>
            </div>
            <p style={{ fontSize: "1.05rem", lineHeight: 1.8, color: "var(--text-primary)", fontWeight: 400 }}>{review.focusRecommendation}</p>
          </section>

          <button
            disabled={isFetching}
            className="btn-secondary"
            style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: "8px" }}
            onClick={async () => {
              await fetch("/api/reports/weekly?force=true");
              refetch();
            }}
          >
            <RefreshCw size={14} /> {isFetching ? "Regenerating..." : "Regenerate review"}
          </button>
        </div>
      ) : (
        <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "60px 0" }}>
          Not enough data for a weekly review yet. Complete a few days of plans and reflections first.
        </p>
      )}
    </div>
  );
}
