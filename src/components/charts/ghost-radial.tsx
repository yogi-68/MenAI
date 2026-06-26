"use client";

interface GhostRadialProps {
  message?: string;
  size?: number;
}

/** Empty success-probability state — ghost ring with ? center. */
export function GhostRadial({
  message = "Complete tasks to see your forecast",
  size = 140,
}: GhostRadialProps) {
  return (
    <div className="flex flex-col items-center justify-center py-4">
      <div
        className="relative flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <svg width={size} height={size} viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke="rgba(124, 111, 255, 0.15)"
            strokeWidth="8"
          />
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke="rgba(124, 111, 255, 0.3)"
            strokeWidth="8"
            strokeDasharray="66 198"
            strokeLinecap="round"
            transform="rotate(-90 50 50)"
          />
        </svg>
        <span
          className="absolute font-data text-2xl"
          style={{ color: "var(--text-muted)", opacity: 0.6 }}
        >
          ?
        </span>
      </div>
      <p className="text-xs text-center mt-3 m-0" style={{ color: "var(--text-muted)", maxWidth: 200 }}>
        {message}
      </p>
    </div>
  );
}
