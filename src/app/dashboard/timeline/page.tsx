"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { History, ArrowLeft } from "lucide-react";

interface TimelineMonth {
  month: string;
  events: Array<{
    headline: string;
    subline?: string;
    category: string;
    dayLabel?: string;
  }>;
}

const CATEGORY_COLOR: Record<string, string> = {
  initiative: "var(--accent-primary)",
  decision: "var(--accent-secondary)",
  milestone: "#22c55e",
  completion: "#22c55e",
  execution: "var(--accent-secondary)",
  reflection: "var(--text-secondary)",
};

export default function TimelinePage() {
  const { data, isLoading } = useQuery({
    queryKey: ["memory-timeline"],
    queryFn: async () => {
      const res = await fetch("/api/memory/timeline");
      if (!res.ok) throw new Error("Failed to load timeline");
      return res.json() as Promise<{ months: TimelineMonth[]; total: number }>;
    },
    staleTime: 60_000,
  });

  return (
    <div className="page-shell">
      <header className="animate-fade-in" style={{ marginBottom: "32px" }}>
        <Link
          href="/dashboard"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "0.85rem",
            color: "var(--text-muted)",
            textDecoration: "none",
            marginBottom: "12px",
          }}
        >
          <ArrowLeft size={14} /> Overview
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <History size={22} style={{ color: "var(--accent-primary)" }} />
          <h1
            style={{
              fontSize: "clamp(1.5rem, 4vw, 2rem)",
              fontWeight: 400,
              letterSpacing: "-0.03em",
              margin: 0,
            }}
          >
            Memory Timeline
          </h1>
        </div>
        <p style={{ color: "var(--text-muted)", marginTop: "8px", maxWidth: 560, lineHeight: 1.6 }}>
          Real events — workouts completed, reflections logged, milestones finished. Not onboarding history.
        </p>
      </header>

      {isLoading ? (
        <div className="skeleton shimmer" style={{ height: 320, borderRadius: 8 }} />
      ) : !data?.months.length ? (
        <div className="glass-card" style={{ padding: "32px", textAlign: "center", color: "var(--text-muted)" }}>
          <p style={{ lineHeight: 1.7, marginBottom: 16, fontSize: "0.95rem" }}>
            No execution events yet. Complete a task, log a reflection, or finish a milestone — those become your timeline.
          </p>
          <Link href="/dashboard/goals" className="btn-primary" style={{ display: "inline-flex", marginTop: 16, textDecoration: "none" }}>
            Add an initiative
          </Link>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
          {data.months.map(({ month, events }) => (
            <section key={month}>
              <h2
                style={{
                  fontSize: "0.8rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "var(--text-muted)",
                  marginBottom: "14px",
                  fontWeight: 500,
                }}
              >
                {month.split(" ")[0]}
              </h2>
              <div className="glass-card" style={{ padding: "8px 0" }}>
                <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                  {events.map((ev, i) => (
                    <li
                      key={`${month}-${i}`}
                      style={{
                        padding: "14px 24px",
                        borderBottom:
                          i < events.length - 1 ? "1px solid var(--border-color)" : "none",
                      }}
                    >
                      <p
                        style={{
                          margin: 0,
                          fontSize: "1.05rem",
                          fontWeight: 450,
                          color: CATEGORY_COLOR[ev.category] || "var(--text-primary)",
                          lineHeight: 1.45,
                        }}
                      >
                        {ev.dayLabel ? `${ev.dayLabel} — ` : ""}
                        {ev.headline}
                      </p>
                      {ev.subline && (
                        <p
                          style={{
                            margin: "4px 0 0",
                            fontSize: "0.82rem",
                            color: "var(--text-muted)",
                            lineHeight: 1.4,
                          }}
                        >
                          {ev.subline}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
