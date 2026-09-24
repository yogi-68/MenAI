"use client";

import { HelpCircle } from "lucide-react";

export function InfoTip({ text }: { text: string }) {
  return (
    <span
      title={text}
      style={{
        display: "inline-flex",
        alignItems: "center",
        marginLeft: "6px",
        color: "var(--text-muted)",
        cursor: "help",
        verticalAlign: "middle",
      }}
      aria-label={text}
    >
      <HelpCircle size={14} />
    </span>
  );
}

export const HEALTH_LEGEND = {
  on_track: "Recent activity — initiative is moving forward.",
  at_risk: "Deadline approaching or no action in 7+ days.",
  stalled: "No action in 14+ days — needs re-engagement.",
  completed: "Initiative marked complete.",
} as const;

export const PLANNING_QUALITY_HELP =
  "How specific Mettle's context is across goals, initiatives, deadlines, obstacles, and time. Answer a few questions to fill gaps — not a score to optimize to 100%.";
