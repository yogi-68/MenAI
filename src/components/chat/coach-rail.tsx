"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CoachKnowledgePanel } from "@/components/chat/coach-knowledge-panel";
import { Sparkles } from "lucide-react";

interface PrecisionCTA {
  goalId: string;
  goalTitle: string;
  score: number;
  factor: string;
}

interface CoachSnapshot {
  score: number;
  statusLabel: string;
  knows?: string[];
  dailyNote: string | null;
  precisionCTA: PrecisionCTA | null;
}

const FACTOR_LABELS: Record<string, string> = {
  deadline: "Add deadline",
  success: "Define success metric",
  obstacle: "Name your obstacle",
  resources: "Set weekly hours",
};

export function CoachRail() {
  const { data, isLoading } = useQuery({
    queryKey: ["coach-snapshot"],
    queryFn: async () => {
      const res = await fetch("/api/coach/snapshot");
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<CoachSnapshot>;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const statusLabel = isLoading ? "Loading…" : data?.statusLabel ?? "Score —";

  return (
    <aside className="coach-rail" aria-label="Coach panel">
      {/* Header */}
      <div className="coach-rail__header">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-base font-semibold" style={{ color: "var(--text-primary)" }}>
            Coach
          </h2>
          <Link
            href="/dashboard/chat"
            className="text-xs no-underline"
            style={{ color: "var(--accent-primary)" }}
          >
            Open chat
          </Link>
        </div>
        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
          {statusLabel}
        </p>
      </div>

      <div className="coach-rail__messages" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {isLoading ? (
          <div className="skeleton shimmer" style={{ height: 80, borderRadius: 8 }} />
        ) : (
          <>
            {/* Section 1 — Today's coaching note */}
            {data?.dailyNote ? (
              <div
                style={{
                  borderLeft: "2px solid var(--accent-primary)",
                  paddingLeft: 10,
                  paddingTop: 2,
                  paddingBottom: 2,
                }}
              >
                <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
                  Today
                </p>
                <p className="text-xs m-0" style={{ color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  {data.dailyNote}
                </p>
              </div>
            ) : null}

            {/* Section 2 — Plan precision CTA */}
            {data?.precisionCTA ? (
              <Link
                href={`/dashboard/chat?intent=improve_confidence&goalId=${data.precisionCTA.goalId}`}
                className="no-underline"
              >
                <div
                  style={{
                    borderRadius: 8,
                    padding: "10px 12px",
                    background: "rgba(245,158,11,0.07)",
                    border: "0.5px solid rgba(245,158,11,0.25)",
                    cursor: "pointer",
                  }}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <Sparkles size={11} style={{ color: "var(--accent-warning)" }} />
                    <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--accent-warning)" }}>
                      Plan precision
                    </span>
                  </div>
                  <p className="text-xs m-0 mb-1" style={{ color: "var(--text-secondary)", lineHeight: 1.4 }}>
                    {data.precisionCTA.score}% — {data.precisionCTA.goalTitle}
                  </p>
                  <p className="text-xs m-0 font-medium" style={{ color: "var(--accent-warning)" }}>
                    {FACTOR_LABELS[data.precisionCTA.factor] ?? "Improve precision"} →
                  </p>
                </div>
              </Link>
            ) : null}

            {/* Section 3 — fallback only when snapshot has no note and no goals */}
            {!data?.dailyNote && !data?.precisionCTA && (
              <div
                style={{
                  borderLeft: "2px solid var(--accent-primary)",
                  paddingLeft: 10,
                }}
              >
                <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
                  Today
                </p>
                <p className="text-xs m-0" style={{ color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  Complete onboarding to get your first daily plan and coaching note.
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer — 4 knowledge bullets max */}
      <div className="coach-rail__footer">
        <CoachKnowledgePanel variant="rail" bullets={data?.knows?.slice(0, 4)} />
      </div>
    </aside>
  );
}
