"use client";

import { useQuery } from "@tanstack/react-query";
import { FileText, RefreshCw } from "lucide-react";

interface WeeklyReview {
  biggestWin: string;
  biggestBottleneck: string;
  initiativeHealthChanges: string[];
  lifeAreaDistribution: string;
  opportunitiesSummary: string;
  focusRecommendation: string;
  executionSummary: string;
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
      <div className="animate-fade-in" style={{ marginBottom: "40px" }}>
        <h1 style={{ fontSize: "clamp(1.75rem, 4vw, 2.5rem)", fontWeight: 400, letterSpacing: "-0.03em" }}>
          Weekly Review
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "1rem", marginTop: "12px", fontWeight: 300, lineHeight: 1.6 }}>
          What happened this week — in plain language, not scores.
        </p>
        {data && (
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: "8px" }}>
            {new Date(data.weekStart).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            {" – "}
            {new Date(data.weekEnd).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </p>
        )}
      </div>

      {isLoading ? (
        <div className="skeleton shimmer" style={{ height: 320, borderRadius: 12 }} />
      ) : review ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <section className="glass-card" style={{ padding: "clamp(28px, 4vw, 40px)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
              <FileText size={18} style={{ color: "var(--accent-primary)" }} />
              <span style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>
                This week
              </span>
            </div>
            <p style={{ fontSize: "1.1rem", lineHeight: 1.85, color: "var(--text-primary)", fontWeight: 300, whiteSpace: "pre-wrap" }}>
              {review.narrative}
            </p>
            {review.executionSummary && (
              <p style={{ fontSize: "0.95rem", color: "var(--text-secondary)", marginTop: "16px", lineHeight: 1.7 }}>
                {review.executionSummary}
              </p>
            )}
          </section>

          <section className="glass-card" style={{ padding: "28px 32px", borderLeft: "3px solid var(--accent-primary)" }}>
            <h2 style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--accent-primary)", marginBottom: "12px" }}>
              Focus next week
            </h2>
            <p style={{ fontSize: "1.05rem", lineHeight: 1.8, color: "var(--text-primary)" }}>{review.focusRecommendation}</p>
          </section>

          {(review.biggestWin || review.biggestBottleneck) && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "20px" }}>
              {review.biggestWin && (
                <section className="glass-card" style={{ padding: "24px 28px" }}>
                  <h2 style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "10px" }}>Win</h2>
                  <p style={{ fontSize: "0.95rem", lineHeight: 1.7 }}>{review.biggestWin}</p>
                </section>
              )}
              {review.biggestBottleneck && (
                <section className="glass-card" style={{ padding: "24px 28px" }}>
                  <h2 style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "10px" }}>Bottleneck</h2>
                  <p style={{ fontSize: "0.95rem", lineHeight: 1.7 }}>{review.biggestBottleneck}</p>
                </section>
              )}
            </div>
          )}

          <button
            disabled={isFetching}
            className="btn-secondary"
            style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: "8px" }}
            onClick={async () => {
              await fetch("/api/reports/weekly?force=true");
              refetch();
            }}
          >
            <RefreshCw size={14} /> {isFetching ? "Regenerating…" : "Regenerate review"}
          </button>
        </div>
      ) : (
        <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "60px 0", lineHeight: 1.7 }}>
          Not enough data yet. Generate a few daily plans, complete tasks, and submit reflections — then your weekly story will appear here.
        </p>
      )}
    </div>
  );
}
