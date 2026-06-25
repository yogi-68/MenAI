"use client";

import { cn } from "@/lib/utils";

export type TimeRange = "7d" | "30d" | "90d";

const OPTIONS: { value: TimeRange; label: string }[] = [
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
];

interface TimeRangeFilterProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
  className?: string;
}

export function TimeRangeFilter({ value, onChange, className }: TimeRangeFilterProps) {
  return (
    <div
      className={cn("inline-flex gap-1 p-1 rounded-full clay-card-inset", className)}
      role="group"
      aria-label="Time range"
    >
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "px-3 py-1 text-xs font-medium rounded-full transition-all",
            value === opt.value
              ? "bg-[var(--accent-primary)] text-white shadow-sm"
              : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function rangeToDays(range: TimeRange): number {
  switch (range) {
    case "7d":
      return 7;
    case "30d":
      return 30;
    case "90d":
      return 90;
  }
}
