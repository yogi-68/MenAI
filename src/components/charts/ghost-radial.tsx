"use client";

import { BarChart3 } from "lucide-react";

interface GhostRadialProps {
  message?: string;
  size?: number;
}

/** Empty chart state — ghost ring + icon, not a bare "?". */
export function GhostRadial({
  message = "Complete tasks to see your forecast",
  size = 90,
}: GhostRadialProps) {
  return (
    <div className="flex flex-col items-center justify-center py-3">
      <div
        className="relative flex items-center justify-center ghost-radial-ring"
        style={{ width: size, height: size }}
      >
        <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke="rgba(124, 111, 255, 0.12)"
            strokeWidth="7"
          />
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke="rgba(124, 111, 255, 0.35)"
            strokeWidth="7"
            strokeDasharray="52 212"
            strokeLinecap="round"
            transform="rotate(-90 50 50)"
          />
        </svg>
        <BarChart3
          size={Math.round(size * 0.22)}
          className="absolute"
          style={{ color: "var(--accent-primary)", opacity: 0.45 }}
          strokeWidth={1.5}
        />
      </div>
      <p
        className="text-[11px] text-center mt-2 m-0 leading-snug"
        style={{ color: "var(--text-muted)", maxWidth: 160 }}
      >
        {message}
      </p>
    </div>
  );
}
