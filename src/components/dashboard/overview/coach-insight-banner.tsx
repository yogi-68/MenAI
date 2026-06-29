"use client";

import { Quote } from "lucide-react";

export function CoachInsightBanner({ insight }: { insight: string }) {
  return (
    <div
      className="rounded-xl p-5 flex gap-3 items-start"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "0.5px solid var(--border-color)",
      }}
    >
      <Quote size={18} className="shrink-0 mt-0.5" style={{ color: "var(--accent-primary)" }} />
      <p className="text-sm m-0 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        {insight}
      </p>
    </div>
  );
}
