"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, ChevronRight, SkipForward, Sparkles } from "lucide-react";

interface ContextDimension {
  id: string;
  label: string;
  satisfied: boolean;
  gapHint?: string;
}

interface ContextSnapshot {
  dimensions: ContextDimension[];
  planningQuality: "Strong" | "Good" | "Fair" | "Needs context";
  shouldInterview: boolean;
  improvementHints: string[];
}

interface InterviewQuestion {
  dimension: string;
  prompt: string;
  subtitle?: string;
  inputType: "text" | "number" | "date";
}

export function PlanContextInterview({ hasInitiatives }: { hasInitiatives: boolean }) {
  const queryClient = useQueryClient();
  const [answer, setAnswer] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [interviewActive, setInterviewActive] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["plan-context"],
    queryFn: async () => {
      const res = await fetch("/api/plans/context");
      if (!res.ok) throw new Error("Failed to load context");
      return res.json() as Promise<{
        snapshot: ContextSnapshot;
        nextQuestion: InterviewQuestion | null;
      }>;
    },
    staleTime: 30_000,
    enabled: hasInitiatives,
  });

  const submit = useMutation({
    mutationFn: async (payload: {
      action: "answer" | "skip" | "generate_now";
      dimension?: string;
      answer?: string;
    }) => {
      const res = await fetch("/api/plans/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Interview failed");
      return res.json();
    },
    onSuccess: (result) => {
      setAnswer("");
      queryClient.invalidateQueries({ queryKey: ["plan-context"] });
      if (result.regenerated || result.done) {
        queryClient.invalidateQueries({ queryKey: ["daily-plan"] });
      }
      if (result.done) {
        setInterviewActive(false);
      }
    },
  });

  if (!hasInitiatives || isLoading || !data) return null;

  const { snapshot, nextQuestion } = data;
  const quality = snapshot.planningQuality;
  const showCard =
    quality !== "Strong" || snapshot.improvementHints.length > 0 || snapshot.shouldInterview;

  if (!showCard) return null;

  const missing = snapshot.dimensions.filter(
    (d) => d.id !== "recent_activity" && !d.satisfied
  );
  const canImprove = snapshot.shouldInterview && nextQuestion;

  return (
    <section
      className="glass-card"
      style={{
        padding: "20px 24px",
        marginBottom: "24px",
        borderLeft: "3px solid #f59e0b",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
        <MessageCircle size={20} style={{ color: "#f59e0b", marginTop: "2px", flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: "0.95rem", fontWeight: 500, marginBottom: "4px", color: "var(--text-primary)" }}>
            {quality === "Strong"
              ? "Today's plan has strong context."
              : "Plan could be more specific."}
          </p>
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "12px" }}>
            Planning quality:{" "}
            <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>{quality}</span>
          </p>

          {missing.length > 0 && (
            <div style={{ marginBottom: "14px" }}>
              <p
                style={{
                  fontSize: "0.75rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--text-muted)",
                  marginBottom: "8px",
                }}
              >
                Missing context
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {snapshot.dimensions
                  .filter((d) => d.id !== "recent_activity")
                  .map((d) => (
                    <span
                      key={d.id}
                      style={{
                        fontSize: "0.8rem",
                        padding: "4px 10px",
                        borderRadius: "999px",
                        background: d.satisfied
                          ? "rgba(34, 197, 94, 0.12)"
                          : "rgba(245, 158, 11, 0.12)",
                        color: d.satisfied ? "#22c55e" : "#f59e0b",
                      }}
                    >
                      {d.satisfied ? "✓" : "✗"} {d.label}
                    </span>
                  ))}
              </div>
            </div>
          )}

          {snapshot.improvementHints.length > 0 && !interviewActive && (
            <div style={{ marginBottom: "14px" }}>
              <p
                style={{
                  fontSize: "0.75rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--text-muted)",
                  marginBottom: "6px",
                }}
              >
                To make today&apos;s plan more specific
              </p>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: "18px",
                  fontSize: "0.85rem",
                  color: "var(--text-secondary)",
                  lineHeight: 1.6,
                }}
              >
                {snapshot.improvementHints.map((hint) => (
                  <li key={hint}>{hint}</li>
                ))}
              </ul>
            </div>
          )}

          {!interviewActive && canImprove && (
            <button
              type="button"
              className="btn-secondary"
              style={{ fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "6px" }}
              onClick={() => setInterviewActive(true)}
            >
              <Sparkles size={14} />
              Answer a few questions to improve today&apos;s plan
              <ChevronRight size={14} />
            </button>
          )}

          {interviewActive && nextQuestion && (
            <div
              style={{
                marginTop: "8px",
                padding: "16px",
                borderRadius: "var(--radius-md)",
                background: "rgba(255,255,255,0.03)",
                border: "1px solid var(--border-color)",
              }}
            >
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "10px" }}>
                I can make today&apos;s plan much more specific. A few questions first.
              </p>
              <p style={{ fontSize: "0.95rem", color: "var(--text-primary)", marginBottom: "6px", lineHeight: 1.5 }}>
                {nextQuestion.prompt}
              </p>
              {nextQuestion.subtitle && (
                <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "12px" }}>
                  {nextQuestion.subtitle}
                </p>
              )}

              {nextQuestion.inputType === "date" ? (
                <input
                  className="input-field"
                  type="date"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  style={{ marginBottom: "12px" }}
                />
              ) : (
                <input
                  className="input-field"
                  type={nextQuestion.inputType === "number" ? "number" : "text"}
                  min={nextQuestion.inputType === "number" ? 1 : undefined}
                  max={nextQuestion.inputType === "number" ? 80 : undefined}
                  placeholder={
                    nextQuestion.inputType === "number" ? "e.g. 20" : "Your answer..."
                  }
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && answer.trim()) {
                      submit.mutate({
                        action: "answer",
                        dimension: nextQuestion.dimension,
                        answer,
                      });
                    }
                  }}
                  style={{ marginBottom: "12px" }}
                  autoFocus
                />
              )}

              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!answer.trim() || submit.isPending}
                  onClick={() =>
                    submit.mutate({
                      action: "answer",
                      dimension: nextQuestion.dimension,
                      answer,
                    })
                  }
                >
                  {submit.isPending ? "Saving…" : "Continue"}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={submit.isPending}
                  style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
                  onClick={() =>
                    submit.mutate({ action: "skip", dimension: nextQuestion.dimension })
                  }
                >
                  <SkipForward size={14} />
                  Skip
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={submit.isPending}
                  onClick={() => submit.mutate({ action: "generate_now" })}
                >
                  Generate plan now
                </button>
              </div>
            </div>
          )}

          {interviewActive && !nextQuestion && !snapshot.shouldInterview && (
            <p style={{ fontSize: "0.85rem", color: "var(--accent-primary)", margin: 0 }}>
              Context is strong enough — regenerating your plan with what we know.
            </p>
          )}

          {!interviewActive && quality !== "Strong" && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              style={{
                marginTop: "8px",
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                fontSize: "0.8rem",
                cursor: "pointer",
                padding: 0,
              }}
            >
              {expanded ? "Hide details" : "Why these gaps matter"}
            </button>
          )}

          {expanded && (
            <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: "8px", lineHeight: 1.6 }}>
              MenAI asks about the weakest areas first and stops when another question
              wouldn&apos;t meaningfully improve your plan — not after a fixed number of questions.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
