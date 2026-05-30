"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, ChevronRight, SkipForward, Sparkles } from "lucide-react";

interface GoalAnalysis {
  headline: string;
  daysRemaining: number | null;
  deadlineLabel: string | null;
  knownFacts: string[];
  missingVariables: Array<{ id: string; label: string; why: string }>;
  onceKnown: string[];
  coachInsight: string;
}

interface ContextSnapshot {
  dimensions: Array<{ id: string; label: string; satisfied: boolean }>;
  planningQuality: "Strong" | "Good" | "Fair" | "Needs context";
  shouldInterview: boolean;
  improvementHints: string[];
}

interface InterviewQuestion {
  variableId: string;
  prompt: string;
  subtitle?: string;
  inputType: "text" | "number" | "date";
}

export function PlanContextInterview({ hasInitiatives }: { hasInitiatives: boolean }) {
  const queryClient = useQueryClient();
  const [answer, setAnswer] = useState("");
  const [interviewActive, setInterviewActive] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["plan-context"],
    queryFn: async () => {
      const res = await fetch("/api/plans/context");
      if (!res.ok) throw new Error("Failed to load context");
      return res.json() as Promise<{
        snapshot: ContextSnapshot;
        goalAnalysis: GoalAnalysis | null;
        nextQuestion: InterviewQuestion | null;
      }>;
    },
    staleTime: 30_000,
    enabled: hasInitiatives,
  });

  const submit = useMutation({
    mutationFn: async (payload: {
      action: "answer" | "skip" | "generate_now";
      variableId?: string;
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
        queryClient.invalidateQueries({ queryKey: ["dashboard-today"] });
      }
      if (result.done) setInterviewActive(false);
    },
  });

  if (!hasInitiatives || isLoading || !data) return null;

  const { snapshot, goalAnalysis, nextQuestion } = data;
  const quality = snapshot.planningQuality;
  const showCard =
    quality !== "Strong" || (goalAnalysis?.missingVariables.length ?? 0) > 0 || snapshot.shouldInterview;

  if (!showCard) return null;

  const domainLabel =
    goalAnalysis && goalAnalysis.missingVariables.some((m) => /body-fat|weight|train/i.test(m.label))
      ? "To help plan your fitness journey:"
      : "MenAI still needs to know:";

  return (
    <section
      className="glass-card"
      style={{ padding: "20px 24px", marginBottom: "24px", borderLeft: "3px solid #f59e0b" }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
        <MessageCircle size={20} style={{ color: "#f59e0b", marginTop: "2px", flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          {goalAnalysis && (
            <div style={{ marginBottom: "16px" }}>
              <p
                style={{
                  fontSize: "0.75rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--text-muted)",
                  marginBottom: "8px",
                }}
              >
                {goalAnalysis.headline}
              </p>
              <p style={{ fontSize: "0.95rem", lineHeight: 1.6, color: "var(--text-primary)", marginBottom: "12px" }}>
                {goalAnalysis.coachInsight}
              </p>
              {goalAnalysis.knownFacts.length > 0 && (
                <div style={{ marginBottom: "10px" }}>
                  <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: "4px" }}>MenAI understands</p>
                  <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.55 }}>
                    {goalAnalysis.knownFacts.filter((f) => !f.startsWith("Initiative:")).map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}
              {goalAnalysis.missingVariables.length > 0 && (
                <div style={{ marginBottom: "10px" }}>
                  <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: "4px" }}>Missing information</p>
                  <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "0.85rem", color: "#f59e0b", lineHeight: 1.55 }}>
                    {goalAnalysis.missingVariables.map((m) => (
                      <li key={m.id}>{m.label}</li>
                    ))}
                  </ul>
                </div>
              )}
              {goalAnalysis.onceKnown.length > 0 && goalAnalysis.missingVariables.length > 0 && (
                <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", lineHeight: 1.5, margin: 0 }}>
                  Once known, MenAI can estimate: {goalAnalysis.onceKnown.join(" · ")}
                </p>
              )}
            </div>
          )}

          {!interviewActive && snapshot.shouldInterview && nextQuestion && (
            <button
              type="button"
              className="btn-secondary"
              style={{ fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "6px" }}
              onClick={() => setInterviewActive(true)}
            >
              <Sparkles size={14} />
              Answer {goalAnalysis?.missingVariables.length || "a few"} questions
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
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "10px" }}>{domainLabel}</p>
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
                  placeholder={nextQuestion.inputType === "number" ? "e.g. 20" : "Your answer..."}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && answer.trim()) {
                      submit.mutate({ action: "answer", variableId: nextQuestion.variableId, answer });
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
                    submit.mutate({ action: "answer", variableId: nextQuestion.variableId, answer })
                  }
                >
                  {submit.isPending ? "Saving…" : "Continue"}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={submit.isPending}
                  style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
                  onClick={() => submit.mutate({ action: "skip", variableId: nextQuestion.variableId })}
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
        </div>
      </div>
    </section>
  );
}
