"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { History, ArrowLeft, Search } from "lucide-react";
import { ClayCard } from "@/components/ui";
import { BarChartCard } from "@/components/charts";

interface TimelineEvent {
  sortKey: string;
  month: string;
  dayLabel: string;
  headline: string;
  subline?: string;
  category: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  goal_created: "Goal Created",
  milestone: "Milestone Achieved",
  habit: "Habit Completed",
  reflection: "AI Reflection",
  weekly_win: "Weekly Win",
  monthly_win: "Monthly Win",
  failure: "Failure",
  course_correction: "Course Correction",
  achievement: "Achievement",
  completion: "Achievement",
  execution: "Task Completed",
  initiative: "Goal Created",
  decision: "Course Correction",
};

const CATEGORY_COLOR: Record<string, string> = {
  goal_created: "var(--accent-primary)",
  milestone: "#22c55e",
  habit: "#8b5cf6",
  reflection: "var(--text-secondary)",
  weekly_win: "#f59e0b",
  monthly_win: "#f59e0b",
  failure: "#ef4444",
  course_correction: "#6366f1",
  achievement: "#22c55e",
  completion: "#22c55e",
  execution: "var(--accent-secondary)",
  initiative: "var(--accent-primary)",
  decision: "#6366f1",
};

const FILTERS = ["all", "goal_created", "milestone", "habit", "reflection", "weekly_win", "achievement", "failure"];

export default function TimelinePage() {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["memory-timeline"],
    queryFn: async () => {
      const res = await fetch("/api/memory/timeline");
      if (!res.ok) throw new Error("Failed to load timeline");
      return res.json() as Promise<{ months: Array<{ month: string; events: TimelineEvent[] }>; total: number }>;
    },
    staleTime: 60_000,
  });

  const { data: analytics } = useQuery({
    queryKey: ["analytics-timeline"],
    queryFn: async () => {
      const res = await fetch("/api/analytics/timeline");
      if (!res.ok) return { categories: [] };
      return res.json();
    },
  });

  const filteredMonths = useMemo(() => {
    if (!data?.months) return [];
    const q = search.trim().toLowerCase();
    return data.months
      .map((m) => ({
        ...m,
        events: m.events.filter((e) => {
          if (filter !== "all" && e.category !== filter) return false;
          if (!q) return true;
          return (
            e.headline.toLowerCase().includes(q) ||
            (e.subline?.toLowerCase().includes(q) ?? false)
          );
        }),
      }))
      .filter((m) => m.events.length > 0);
  }, [data, filter, search]);

  return (
    <div className="page-shell">
      <header className="animate-fade-in" style={{ marginBottom: "28px" }}>
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
          <h1 style={{ fontSize: "clamp(1.5rem, 4vw, 2rem)", fontWeight: 400, letterSpacing: "-0.03em", margin: 0 }}>
            Life Timeline
          </h1>
        </div>
        <p style={{ color: "var(--text-muted)", marginTop: "8px", maxWidth: 560, lineHeight: 1.6 }}>
          Goals, milestones, habits, wins, failures, and course corrections — your execution story.
        </p>
      </header>

      {analytics?.categories?.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <BarChartCard
            title="Events by category"
            data={analytics.categories.map((c: { category: string; count: number }) => ({
              label: CATEGORY_LABEL[c.category] || c.category,
              value: c.count,
            }))}
          />
        </div>
      )}

      <ClayCard className="p-4 mb-6" hover={false}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={filter === f ? "btn-primary" : "btn-secondary"}
              style={{ padding: "6px 14px", fontSize: "0.78rem" }}
            >
              {f === "all" ? "All" : CATEGORY_LABEL[f] || f}
            </button>
          ))}
        </div>
        <div style={{ position: "relative" }}>
          <Search size={16} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input
            className="input-field"
            placeholder="Search timeline..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 40 }}
          />
        </div>
      </ClayCard>

      {isLoading ? (
        <div className="skeleton shimmer" style={{ height: 320, borderRadius: "var(--radius-lg)" }} />
      ) : !filteredMonths.length ? (
        <ClayCard className="p-8 text-center" hover={false}>
          <p style={{ color: "var(--text-muted)", lineHeight: 1.7 }}>
            No events match your filters. Complete tasks and reflections to build your timeline.
          </p>
          <Link href="/dashboard/plans" className="btn-primary" style={{ display: "inline-flex", marginTop: 16, textDecoration: "none" }}>
            Today&apos;s Plan
          </Link>
        </ClayCard>
      ) : (
        <div style={{ position: "relative", paddingLeft: 28 }}>
          <div
            style={{
              position: "absolute",
              left: 10,
              top: 0,
              bottom: 0,
              width: 2,
              background: "linear-gradient(180deg, var(--accent-primary), transparent)",
              borderRadius: 2,
            }}
          />
          <AnimatePresence>
            {filteredMonths.map((month) => (
              <motion.section
                key={month.month}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4 }}
                style={{ marginBottom: 32 }}
              >
                <div className="clay-label" style={{ marginBottom: 16, paddingLeft: 8 }}>
                  {month.month}
                </div>
                {month.events.map((event, idx) => (
                  <motion.div
                    key={`${event.sortKey}-${idx}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    style={{ position: "relative", marginBottom: 16, paddingLeft: 20 }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        left: -22,
                        top: 18,
                        width: 12,
                        height: 12,
                        borderRadius: "50%",
                        background: CATEGORY_COLOR[event.category] || "var(--accent-primary)",
                        boxShadow: "var(--shadow-clay-outer)",
                      }}
                    />
                    <ClayCard className="p-4" hover>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                        <span className="clay-label" style={{ color: CATEGORY_COLOR[event.category] }}>
                          {CATEGORY_LABEL[event.category] || event.category}
                        </span>
                        {event.dayLabel && (
                          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{event.dayLabel}</span>
                        )}
                      </div>
                      <p style={{ marginTop: 8, fontWeight: 500, lineHeight: 1.5 }}>{event.headline}</p>
                      {event.subline && (
                        <p style={{ marginTop: 6, fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                          {event.subline}
                        </p>
                      )}
                    </ClayCard>
                  </motion.div>
                ))}
              </motion.section>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
