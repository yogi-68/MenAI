"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, SkipForward } from "lucide-react";
import { missingKnowledgeLabels, type IdentityDimensionId } from "@/lib/user-model/identity-dimensions";

interface InterviewQuestion {
  variableId: string;
  dimension?: IdentityDimensionId;
  prompt: string;
  subtitle?: string;
  inputType: "text" | "number" | "date" | "choice";
  choices?: string[];
  expectedGain?: number;
  questionNumber?: number;
}

interface ContextSnapshot {
  planningQuality: "Strong" | "Good" | "Fair" | "Needs context";
  shouldInterview: boolean;
}

interface PlanContextData {
  snapshot: ContextSnapshot;
  nextQuestion: InterviewQuestion | null;
  biggestUnknown: string | null;
  identityCoverage: Record<IdentityDimensionId, number> | null;
  overallCoverage: number | null;
}

interface InterviewSubmitResponse {
  done: boolean;
  nextQuestion: InterviewQuestion | null;
  biggestUnknown: string | null;
  identityCoverage: Record<IdentityDimensionId, number>;
  overallCoverage: number;
  snapshot?: { shouldInterview: boolean };
  timings?: { saveMs: number; nextMs: number; totalMs: number };
}

export function PlanContextInterview({ hasInitiatives }: { hasInitiatives: boolean }) {
  const queryClient = useQueryClient();
  const [answer, setAnswer] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["plan-context"],
    queryFn: async () => {
      const res = await fetch("/api/plans/context");
      if (!res.ok) throw new Error("Failed to load context");
      return res.json() as Promise<PlanContextData>;
    },
    staleTime: 60_000,
    enabled: hasInitiatives,
  });

  const submit = useMutation({
    mutationFn: async (payload: {
      action: "answer" | "skip" | "generate_now";
      variableId?: string;
      dimension?: IdentityDimensionId;
      answer?: string;
    }) => {
      const res = await fetch("/api/plans/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Interview failed");
      return res.json() as Promise<InterviewSubmitResponse>;
    },
    onSuccess: (result) => {
      setAnswer("");

      queryClient.setQueryData<PlanContextData>(["plan-context"], (prev) => {
        if (!prev) return prev;
        const shouldInterview = result.snapshot?.shouldInterview ?? !result.done;
        return {
          ...prev,
          snapshot: { ...prev.snapshot, shouldInterview },
          nextQuestion: result.nextQuestion,
          biggestUnknown: result.biggestUnknown,
          identityCoverage: result.identityCoverage ?? prev.identityCoverage,
          overallCoverage: result.overallCoverage ?? prev.overallCoverage,
        };
      });

      if (result.done) {
        queryClient.invalidateQueries({ queryKey: ["daily-plan"] });
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ["dashboard-today"] });
        }, 2000);
      }
    },
  });

  useEffect(() => {
    setAnswer("");
  }, [data?.nextQuestion?.variableId]);

  if (!hasInitiatives || isLoading || !data) return null;

  const { snapshot, nextQuestion, biggestUnknown, identityCoverage } = data;
  const showCard = snapshot.shouldInterview && nextQuestion;

  if (!showCard) return null;

  const stillNeedToUnderstand = identityCoverage
    ? missingKnowledgeLabels(identityCoverage, 30)
    : [];

  return (
    <section
      className="glass-card"
      style={{ padding: "20px 24px", marginBottom: "24px", borderLeft: "3px solid #f59e0b" }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
        <MessageCircle size={20} style={{ color: "#f59e0b", marginTop: "2px", flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: "0.95rem", fontWeight: 500, color: "var(--text-primary)", marginBottom: "6px" }}>
            A few details would sharpen today&apos;s plan.
          </p>
          {stillNeedToUnderstand.length > 0 && (
            <div style={{ marginBottom: "16px" }}>
              <p style={{ fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "8px" }}>
                Still need to understand
              </p>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: "0.88rem", color: "var(--text-secondary)", lineHeight: 1.7 }}>
                {stillNeedToUnderstand.map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ul>
            </div>
          )}
          <p style={{ fontSize: "0.88rem", color: "var(--text-secondary)", marginBottom: "16px", lineHeight: 1.6 }}>
            The biggest unknown:{" "}
            <span style={{ color: "var(--text-primary)" }}>
              {(biggestUnknown || nextQuestion.subtitle || "one more detail").charAt(0).toLowerCase() +
                (biggestUnknown || nextQuestion.subtitle || "one more detail").slice(1)}
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

            {nextQuestion.inputType === "choice" && nextQuestion.choices?.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "12px" }}>
                {nextQuestion.choices.map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    className="btn-secondary"
                    disabled={submit.isPending}
                    style={{ textAlign: "left", justifyContent: "flex-start" }}
                    onClick={() =>
                      submit.mutate({
                        action: "answer",
                        variableId: nextQuestion.variableId,
                        dimension: nextQuestion.dimension,
                        answer: choice,
                      })
                    }
                  >
                    {choice}
                  </button>
                ))}
              </div>
            ) : nextQuestion.inputType === "date" ? (
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
                    submit.mutate({
                      action: "answer",
                      variableId: nextQuestion.variableId,
                      dimension: nextQuestion.dimension,
                      answer,
                    });
                  }
                }}
                style={{ marginBottom: "12px" }}
                autoFocus
              />
            )}

            {nextQuestion.inputType !== "choice" && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!answer.trim() || submit.isPending}
                  onClick={() =>
                    submit.mutate({
                      action: "answer",
                      variableId: nextQuestion.variableId,
                      dimension: nextQuestion.dimension,
                      answer,
                    })
                  }
                >
                  {submit.isPending ? "Saving…" : "Answer"}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={submit.isPending}
                  style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
                  onClick={() =>
                    submit.mutate({ action: "skip", variableId: nextQuestion.variableId })
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
            )}
            {nextQuestion.inputType === "choice" && (
              <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={submit.isPending}
                  onClick={() =>
                    submit.mutate({ action: "skip", variableId: nextQuestion.variableId })
                  }
                >
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
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
