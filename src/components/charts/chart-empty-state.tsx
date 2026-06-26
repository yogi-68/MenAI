"use client";

interface ChartEmptyStateProps {
  message?: string;
  variant?: "bars" | "line";
  height?: number;
}

export function ChartEmptyState({
  message = "Complete tasks to build your history",
  variant = "bars",
  height = 160,
}: ChartEmptyStateProps) {
  return (
    <div
      className="relative flex items-end justify-center gap-2 px-4"
      style={{ height, opacity: 0.45 }}
      aria-hidden
    >
      {variant === "bars" ? (
        <>
          {[40, 55, 35, 50, 45, 38, 48].map((h, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                maxWidth: 32,
                height: `${h}%`,
                borderRadius: 4,
                background: "rgba(124, 111, 255, 0.25)",
              }}
            />
          ))}
        </>
      ) : (
        <svg width="100%" height="100%" viewBox="0 0 200 80" preserveAspectRatio="none">
          <path
            d="M0,60 Q50,20 100,40 T200,25"
            fill="none"
            stroke="rgba(124, 111, 255, 0.35)"
            strokeWidth="2"
            strokeDasharray="4 4"
          />
        </svg>
      )}
      <div
        className="absolute inset-0 flex items-center justify-center text-center px-4"
        style={{ opacity: 1 }}
      >
        <p className="text-xs m-0" style={{ color: "var(--text-muted)", maxWidth: 220 }}>
          {message}
        </p>
      </div>
    </div>
  );
}
