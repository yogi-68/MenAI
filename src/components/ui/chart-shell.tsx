"use client";

import { cn } from "@/lib/utils";
import { ClayCard } from "./clay-card";

interface ChartShellProps {
  title: string;
  subtitle?: string;
  loading?: boolean;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}

export function ChartShell({
  title,
  subtitle,
  loading,
  children,
  className,
  action,
}: ChartShellProps) {
  return (
    <ClayCard className={cn("p-5 md:p-6", className)} hover={false}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="clay-label">{subtitle || "Analytics"}</div>
          <h3 className="text-base font-medium mt-1" style={{ color: "var(--text-primary)" }}>
            {title}
          </h3>
        </div>
        {action}
      </div>
      {loading ? (
        <div className="skeleton shimmer" style={{ height: 220, borderRadius: "var(--radius-md)" }} />
      ) : (
        <div style={{ width: "100%", minHeight: 200 }}>{children}</div>
      )}
    </ClayCard>
  );
}
