"use client";

import Link from "next/link";
import { Target, Zap, Sparkles, CheckCircle2, Circle } from "lucide-react";

interface SetupChecklistProps {
  hasInitiatives?: boolean;
  hasOpportunities?: boolean;
  hasCommitments?: boolean;
  hasReflections?: boolean;
}

export function SetupChecklist({
  hasInitiatives = false,
  hasOpportunities = false,
  hasCommitments = false,
  hasReflections = false,
}: SetupChecklistProps) {
  const items = [
    {
      done: hasInitiatives,
      icon: Target,
      label: "One initiative with a deadline",
      hint: "Specific projects drive your daily plan",
      href: "/dashboard/goals",
    },
    {
      done: hasOpportunities,
      icon: Sparkles,
      label: "One time-sensitive opportunity",
      hint: "Optional upside the planner should weigh",
      href: "/dashboard/goals",
    },
    {
      done: hasCommitments,
      icon: Zap,
      label: "One commitment or linked task",
      hint: "Concrete actions tied to your goals",
      href: "/dashboard/goals",
    },
    {
      done: hasReflections,
      icon: CheckCircle2,
      label: "End-of-day reflection",
      hint: "Three short answers improve tomorrow's plan",
      href: "#reflection",
    },
  ];

  const doneCount = items.filter((i) => i.done).length;
  if (doneCount >= 3) return null;

  return (
    <section
      className="glass-card"
      style={{
        padding: "24px 28px",
        marginBottom: "24px",
        borderLeft: "3px solid #f59e0b",
      }}
    >
      <h2 style={{ fontSize: "1rem", fontWeight: 500, marginBottom: "8px" }}>
        Make your plan dramatically more useful
      </h2>
      <p style={{ fontSize: "0.9rem", color: "var(--text-muted)", marginBottom: "20px", lineHeight: 1.6 }}>
        MenAI needs a little structure before it can give bold, specific daily plans. Add these first:
      </p>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "14px" }}>
        {items.map((item) => (
          <li key={item.label}>
            <Link
              href={item.href}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "12px",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              {item.done ? (
                <CheckCircle2 size={20} style={{ color: "var(--accent-primary)", flexShrink: 0, marginTop: 2 }} />
              ) : (
                <Circle size={20} style={{ color: "var(--text-muted)", flexShrink: 0, marginTop: 2 }} />
              )}
              <div>
                <div style={{ fontSize: "0.95rem", fontWeight: item.done ? 400 : 500, color: item.done ? "var(--text-muted)" : "var(--text-primary)" }}>
                  {item.label}
                </div>
                {!item.done && (
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "2px" }}>{item.hint}</div>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <Link
        href="/dashboard/goals"
        className="btn-primary"
        style={{ display: "inline-block", marginTop: "20px", padding: "10px 20px", fontSize: "0.9rem", textDecoration: "none" }}
      >
        Set up Initiatives →
      </Link>
    </section>
  );
}
