"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard error:", error);
  }, [error]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        padding: "32px",
        textAlign: "center",
        gap: "20px",
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          background: "rgba(252, 92, 156, 0.1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <AlertTriangle size={28} style={{ color: "var(--accent-tertiary)" }} />
      </div>

      <h2 style={{ fontSize: "1.3rem", fontWeight: 700 }}>
        Something went wrong
      </h2>

      <p
        style={{
          color: "var(--text-secondary)",
          maxWidth: "400px",
          lineHeight: 1.6,
          fontSize: "0.95rem",
        }}
      >
        We hit an unexpected issue. This has been logged and we&apos;re on it.
        You can try refreshing the page.
      </p>

      <button
        onClick={reset}
        className="btn-primary"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <RefreshCw size={18} />
        Try Again
      </button>
    </div>
  );
}
