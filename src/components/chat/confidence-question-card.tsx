"use client";

import { useState } from "react";
import { Loader2, CheckCircle } from "lucide-react";

export interface ConfidenceOption {
  label: string;
  value: string;
  isOther?: boolean;
}

export interface ConfidenceQuestion {
  factor: "deadline" | "obstacle" | "success" | "resources";
  question: string;
  options: ConfidenceOption[];
  goalId: string;
  goalTitle: string;
}

/** Pre-computed deterministic question bank — no LLM calls needed */
export const CONFIDENCE_QUESTIONS: Record<
  "deadline" | "obstacle" | "success" | "resources",
  Omit<ConfidenceQuestion, "goalId" | "goalTitle">
> = {
  deadline: {
    factor: "deadline",
    question: "When do you want to achieve this goal?",
    options: [
      { label: "3 months", value: "90_days" },
      { label: "6 months", value: "180_days" },
      { label: "1 year", value: "365_days" },
      { label: "2–3 years", value: "900_days" },
      { label: "Pick a date", value: "__other__", isOther: true },
    ],
  },
  success: {
    factor: "success",
    question: "How will you know when you've succeeded?",
    options: [
      { label: "I'll hit a specific number or metric", value: "I will hit a measurable metric defined by a number or result." },
      { label: "I'll feel consistently confident in this area", value: "I will feel consistently confident and capable in this area." },
      { label: "Others will notice a clear improvement", value: "Others around me will clearly notice the improvement." },
      { label: "I'll have built a sustainable habit", value: "I will have built a sustainable, repeatable habit." },
      { label: "Write my own", value: "__other__", isOther: true },
    ],
  },
  obstacle: {
    factor: "obstacle",
    question: "What's the biggest thing that could block your progress?",
    options: [
      { label: "Not enough time in my schedule", value: "Time scarcity — daily schedule is too full." },
      { label: "Motivation drops after early progress", value: "Motivation dips — I lose momentum after initial gains." },
      { label: "Unsure what the right next step is", value: "Decision paralysis — unclear what to do next." },
      { label: "External interruptions or commitments", value: "External interruptions — family, work, or life events." },
      { label: "Describe my own", value: "__other__", isOther: true },
    ],
  },
  resources: {
    factor: "resources",
    question: "How much time per week can you realistically dedicate to this?",
    options: [
      { label: "1–2 hours", value: "1-2 hours per week available for this goal." },
      { label: "3–5 hours", value: "3-5 hours per week available for this goal." },
      { label: "6–10 hours", value: "6-10 hours per week available for this goal." },
      { label: "10+ hours", value: "10+ hours per week available for this goal." },
      { label: "It varies a lot", value: "__other__", isOther: true },
    ],
  },
};

interface ConfidenceQuestionCardProps {
  question: ConfidenceQuestion;
  onAnswered?: (newScore: number, nextFactor: string | null) => void;
}

export function ConfidenceQuestionCard({
  question,
  onAnswered,
}: ConfidenceQuestionCardProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [otherText, setOtherText] = useState("");
  const [showOther, setShowOther] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);
  const [nextQuestion, setNextQuestion] = useState<ConfidenceQuestion | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(value: string) {
    if (loading || done) return;
    const finalValue = value === "__other__" ? otherText.trim() : value;
    if (!finalValue) return;

    setSelected(value);
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/confidence/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goalId: question.goalId,
          factor: question.factor,
          value: finalValue,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");

      setConfirmMessage(data.confirmMessage);
      setDone(true);

      if (data.nextFactor) {
        const template = CONFIDENCE_QUESTIONS[data.nextFactor as keyof typeof CONFIDENCE_QUESTIONS];
        if (template) {
          setNextQuestion({
            ...template,
            goalId: question.goalId,
            goalTitle: question.goalTitle,
          });
        }
      }

      onAnswered?.(data.newScore, data.nextFactor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSelected(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="my-2 space-y-3">
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
        {/* Goal context */}
        <p className="text-xs text-white/40 uppercase tracking-wider font-medium">
          Plan precision · {question.goalTitle}
        </p>

        {/* Question */}
        <p className="text-sm text-white/90 leading-relaxed">{question.question}</p>

        {/* Options */}
        {!done && (
          <div className="flex flex-wrap gap-2">
            {question.options.map((opt) => {
              const isSelectedOpt = selected === opt.value;
              const isOther = opt.isOther;

              return (
                <div key={opt.value} className="flex flex-col gap-1">
                  <button
                    onClick={() => {
                      if (isOther) {
                        setShowOther(true);
                        setSelected("__other__");
                      } else {
                        submit(opt.value);
                      }
                    }}
                    disabled={loading || !!selected}
                    className={[
                      "rounded-full px-3 py-1.5 text-xs font-medium transition-all border",
                      "disabled:cursor-not-allowed",
                      isSelectedOpt
                        ? "bg-indigo-500 border-indigo-400 text-white"
                        : "bg-white/5 border-white/15 text-white/70 hover:bg-white/10 hover:text-white hover:border-white/30",
                    ].join(" ")}
                  >
                    {loading && isSelectedOpt ? (
                      <Loader2 className="w-3 h-3 animate-spin inline mr-1" />
                    ) : null}
                    {opt.label}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Other text input */}
        {!done && showOther && selected === "__other__" && (
          <div className="flex gap-2 mt-1">
            <input
              type="text"
              autoFocus
              value={otherText}
              onChange={(e) => setOtherText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submit("__other__"); }}
              placeholder="Type your answer…"
              className="flex-1 rounded-lg bg-white/10 border border-white/20 text-white text-xs px-3 py-2 placeholder:text-white/30 focus:outline-none focus:border-indigo-400"
            />
            <button
              onClick={() => submit("__other__")}
              disabled={!otherText.trim() || loading}
              className="rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white text-xs px-3 py-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
            </button>
          </div>
        )}

        {/* Error state */}
        {error && (
          <p className="text-xs text-red-400">{error}</p>
        )}

        {/* Confirmation */}
        {done && confirmMessage && (
          <div className="flex items-start gap-2 pt-1">
            <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
            <p className="text-sm text-white/70">{confirmMessage}</p>
          </div>
        )}
      </div>

      {/* Chain to next question */}
      {nextQuestion && (
        <ConfidenceQuestionCard
          question={nextQuestion}
          onAnswered={onAnswered}
        />
      )}
    </div>
  );
}
