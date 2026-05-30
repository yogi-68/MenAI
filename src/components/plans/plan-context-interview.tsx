"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, SkipForward } from "lucide-react";

interface InterviewQuestion {
  variableId: string;
  prompt: string;
  subtitle?: string;
  inputType: "text" | "number" | "date";
  expectedGain?: number;
  biggestUnknown?: string;
  questionNumber?: number;
}

interface ContextSnapshot {
  planningQuality: "Strong" | "Good" | "Fair" | "Needs context";
  shouldInterview: boolean;
}

export function PlanContextInterview({ hasInitiatives }: { hasInitiatives: boolean }) {
  const queryClient = useQueryClient();
  const [answer, setAnswer] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["plan-context"],
    queryFn: async () => {
      const res = await fetch("/api/plans/context");
      if (!res.ok) throw new Error("Failed to load context");
      return res.json() as Promise<{
        snapshot: ContextSnapshot;
        nextQuestion: InterviewQuestion | null;
        biggestUnknown: string | null;
        stopReason?: string;
      }>;
    },
    staleTime: 15_000,
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
    },
  });

  useEffect(() => {
    setAnswer("");
  }, [data?.nextQuestion?.variableId]);

  if (!hasInitiatives || isLoading || !data) return null;

  const { snapshot, nextQuestion, biggestUnknown } = data;
  const showCard =
    snapshot.shouldInterview && nextQuestion && snapshot.planningQuality !== "Strong";

  if (!showCard) return null;

  const headerUnknown =
    nextQuestion.biggestUnknown || biggestUnknown || "one more detail";

  return (
    <section
      className="glass-card"
      style={{ padding: "20px 24px", marginBottom: "24px", borderLeft: "3px solid #f59e0b" }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
        <MessageCircle size={20} style={{ color: "#f59e0b", marginTop: "2px", flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <p
            style={{
              fontSize: "0.95rem",
              fontWeight: 500,
              color: "var(--text-primary)",
              marginBottom: "6px",
              lineHeight: 1.5,
            }}
          >
            MenAI can make today&apos;s plan more specific.
          </p>
          <p style={{ fontSize: "0.88rem", color: "var(--text-secondary)", marginBottom: "16px", lineHeight: 1.6 }}>
            Biggest unknown:{" "}
            <span style={{ color: "var(--text-primary)" }}>
              {headerUnknown.charAt(0).toLowerCase() + headerUnknown.slice(1)}
            </span>
          </p>

          <div
            style={{
              padding: "16px",
              borderRadius: "var(--radius-md)",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid var(--border-color)",
            }}
          >
            {nextQuestion.questionNumber && nextQuestion.questionNumber > 1 && (
              <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "8px" }}>
                Question {nextQuestion.questionNumber}
              </p>
            )}
            <p style={{ fontSize: "0.95rem", color: "var(--text-primary)", marginBottom: "6px", lineHeight: 1.5 }}>
              {nextQuestion.prompt}
            </p>
            {nextQuestion.subtitle && (
              <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "12px", lineHeight: 1.5 }}>
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
                {submit.isPending ? "Updating…" : "Answer"}
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
        </div>
      </div>
    </section>
  );
}
