"use client";

import Link from "next/link";
import { Target } from "lucide-react";

interface SetupChecklistProps {
  hasInitiatives?: boolean;
}

/** Shown when user has no initiative — daily plans require one. */
export function SetupChecklist({ hasInitiatives = false }: SetupChecklistProps) {
  if (hasInitiatives) return null;

  return (
    <section
      className="glass-card"
      style={{
        padding: "24px 28px",
        marginBottom: "24px",
        borderLeft: "3px solid var(--accent-primary)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "16px" }}>
        <Target size={20} style={{ color: "var(--accent-primary)", flexShrink: 0, marginTop: 2 }} />
        <div>
          <h2 style={{ fontSize: "1rem", fontWeight: 500, marginBottom: "8px" }}>
            Create an initiative to generate your daily plan
          </h2>
          <p style={{ fontSize: "0.9rem", color: "var(--text-muted)", lineHeight: 1.65, margin: 0 }}>
            MenAI plans from <strong style={{ fontWeight: 500, color: "var(--text-secondary)" }}>initiatives → milestones → tasks</strong>.
            Long-term direction alone is not enough — you need something finishable in 30–90 days.
          </p>
        </div>
      </div>
      <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "16px", lineHeight: 1.6 }}>
        Examples:
      </p>
      <ul style={{ margin: "0 0 20px", paddingLeft: "20px", fontSize: "0.88rem", color: "var(--text-muted)", lineHeight: 1.8 }}>
        <li>Launch an AI SaaS MVP by July</li>
        <li>Lose 5 kg by August</li>
        <li>Crack UPSC Prelims by September</li>
      </ul>
      <Link
        href="/dashboard/goals"
        className="btn-primary"
        style={{ display: "inline-block", padding: "10px 20px", fontSize: "0.9rem", textDecoration: "none" }}
      >
        Create initiative
      </Link>
    </section>
  );
}
