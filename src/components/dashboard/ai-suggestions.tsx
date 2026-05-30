"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Check, X } from "lucide-react";

interface Suggestion {
  id: string;
  suggestion_type: string;
  title: string;
  payload: Record<string, string>;
  confidence: number;
}

export function AiSuggestionsBanner() {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["ai-suggestions"],
    queryFn: async () => {
      const res = await fetch("/api/suggestions");
      if (!res.ok) return { suggestions: [] as Suggestion[] };
      return res.json() as Promise<{ suggestions: Suggestion[] }>;
    },
    staleTime: 15_000,
  });

  const resolve = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "accept" | "dismiss" }) => {
      const res = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-suggestions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-today"] });
      queryClient.invalidateQueries({ queryKey: ["initiatives"] });
    },
  });

  const pending = data?.suggestions || [];
  if (pending.length === 0) return null;

  const top = pending[0];
  const typeLabel =
    top.suggestion_type === "initiative"
      ? "Suggestion"
      : top.suggestion_type === "opportunity"
        ? "Opportunity"
        : "Long-term direction";

  return (
    <section
      className="glass-card"
      style={{
        padding: "20px 24px",
        borderLeft: "3px solid var(--accent-primary)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <Sparkles size={18} style={{ color: "var(--accent-primary)", marginTop: 2, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <p style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: 6 }}>
            {typeLabel}
          </p>
          <p style={{ fontSize: "1.05rem", fontWeight: 500, marginBottom: 4 }}>{top.title}</p>
          {top.payload?.targetDate && (
            <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              Target: {top.payload.targetDate}
            </p>
          )}
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 8 }}>
            MenAI detected this from your conversation. Confirm before it becomes active.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button
            type="button"
            className="btn-primary"
            disabled={resolve.isPending}
            onClick={() => resolve.mutate({ id: top.id, action: "accept" })}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", fontSize: "0.85rem" }}
          >
            <Check size={14} /> Create
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={resolve.isPending}
            onClick={() => resolve.mutate({ id: top.id, action: "dismiss" })}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", fontSize: "0.85rem" }}
          >
            <X size={14} /> Dismiss
          </button>
        </div>
      </div>
      {resolve.isError && (
        <p style={{ color: "#ef4444", fontSize: "0.85rem", marginTop: 12 }}>
          {(resolve.error as Error).message}
        </p>
      )}
      {pending.length > 1 && (
        <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 12 }}>
          +{pending.length - 1} more suggestion{pending.length > 2 ? "s" : ""} waiting
        </p>
      )}
    </section>
  );
}
