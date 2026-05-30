"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { History, ArrowLeft } from "lucide-react";

interface TimelineMonth {
  month: string;
  events: Array<{
    label: string;
    detail: string;
    category: string;
  }>;
}

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
        <Link href="/dashboard" style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", color: "var(--text-muted)", textDecoration: "none", marginBottom: "12px" }}>
          <ArrowLeft size={14} /> Overview
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <History size={22} style={{ color: "var(--accent-primary)" }} />
          <h1 style={{ fontSize: "clamp(1.5rem, 4vw, 2rem)", fontWeight: 400, letterSpacing: "-0.03em", margin: 0 }}>
            Memory Timeline
          </h1>
        </div>
        <p style={{ color: "var(--text-muted)", marginTop: "8px", maxWidth: 560, lineHeight: 1.6 }}>
          Your progress across fitness, career, business, and life — stitched from initiatives, execution, reflections, and reviews.
        </p>
      </header>

      {isLoading ? (
        <div className="skeleton shimmer" style={{ height: 320, borderRadius: 8 }} />
      ) : !data?.months.length ? (
        <div className="glass-card" style={{ padding: "32px", textAlign: "center", color: "var(--text-muted)" }}>
          <p>Your timeline fills in as you add initiatives, complete tasks, and reflect.</p>
          <Link href="/dashboard/goals" className="btn-primary" style={{ display: "inline-flex", marginTop: 16, textDecoration: "none" }}>
            Add an initiative
          </Link>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
          {data.months.map(({ month, events }) => (
            <section key={month} className="glass-card" style={{ padding: "24px 28px" }}>
              <h2 style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "16px" }}>
                {month}
              </h2>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "14px" }}>
                {events.map((ev, i) => (
                  <li key={`${month}-${i}`} style={{ borderLeft: "2px solid var(--border-color)", paddingLeft: "16px" }}>
                    <p style={{ fontWeight: 500, margin: "0 0 4px", color: "var(--text-primary)" }}>{ev.label}</p>
                    <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>{ev.detail}</p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
