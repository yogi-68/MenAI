"use client";

import { useQuery } from "@tanstack/react-query";
import { FileText, RefreshCw } from "lucide-react";

interface WeeklyReview {
  whatHappened: string;
  patternDetected: string;
  biggestWin: string;
  biggestRisk: string;
  focusNextWeek: string;
}

function ReviewSection({
  label,
  children,
  accent,
}: {
  label: string;
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <section
      className="glass-card"
      style={{
        padding: accent ? "28px 32px" : "clamp(24px, 3vw, 32px)",
        borderLeft: accent ? "3px solid var(--accent-primary)" : undefined,
      }}
    >
      <h2
        style={{
          fontSize: "0.8rem",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: accent ? "var(--accent-primary)" : "var(--text-muted)",
          marginBottom: "12px",
        }}
      >
        {label}
      </h2>
      <p
        style={{
          fontSize: accent ? "1.05rem" : "1rem",
          lineHeight: 1.85,
          color: "var(--text-primary)",
          fontWeight: 300,
          whiteSpace: "pre-wrap",
        }}
      >
        {children}
      </p>
    </section>
  );
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
  const hasContent =
    review &&
    (review.whatHappened ||
      review.patternDetected ||
      review.biggestWin ||
      review.biggestRisk ||
      review.focusNextWeek);

  return (
    <div className="page-shell">
      <div className="animate-fade-in" style={{ marginBottom: "40px" }}>
        <h1 style={{ fontSize: "clamp(1.75rem, 4vw, 2.5rem)", fontWeight: 400, letterSpacing: "-0.03em" }}>
          Weekly Review
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "1rem", marginTop: "12px", fontWeight: 300, lineHeight: 1.6 }}>
          What happened, what changed, and what matters next — written for you, not a dashboard.
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
      ) : hasContent ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {review.whatHappened && (
            <ReviewSection label="What actually happened">{review.whatHappened}</ReviewSection>
          )}

          {review.patternDetected && (
            <ReviewSection label="Pattern detected">{review.patternDetected}</ReviewSection>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "20px" }}>
            {review.biggestWin && (
              <ReviewSection label="The most meaningful progress">{review.biggestWin}</ReviewSection>
            )}
            {review.biggestRisk && (
              <ReviewSection label="The thing most likely to slow you down">{review.biggestRisk}</ReviewSection>
            )}
          </div>

          {review.focusNextWeek && (
            <ReviewSection label="One thing worth protecting next week" accent>
              {review.focusNextWeek}
            </ReviewSection>
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
          Not enough data yet. Create an initiative, complete a few tasks, and submit reflections — then your weekly story will appear here.
        </p>
      )}
    </div>
  );
}
