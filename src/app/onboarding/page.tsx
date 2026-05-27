"use client";

/**
 * Onboarding Flow Component
 * Multi-stage questionnaire with one-question-at-a-time flow
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ONBOARDING_QUESTIONS,
  QUESTION_ORDER,
  getNextQuestion,
  getTotalQuestions,
  getQuestionNumber,
  type OnboardingQuestion,
} from "@/lib/onboarding/questions";

export default function OnboardingPage() {
  const router = useRouter();
  const [currentQuestionId, setCurrentQuestionId] = useState<string>("Q1");
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [textInput, setTextInput] = useState("");
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [sliderValue, setSliderValue] = useState<number>(3);
  const [showOther, setShowOther] = useState(false);
  const [otherText, setOtherText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [askingFollowUp, setAskingFollowUp] = useState(false);

  const currentQuestion = ONBOARDING_QUESTIONS[currentQuestionId];
  const questionNumber = getQuestionNumber(currentQuestionId);
  const totalQuestions = getTotalQuestions();
  const progress = (questionNumber / totalQuestions) * 100;

  useEffect(() => {
    // Load progress
    fetch("/api/onboarding/progress")
      .then((res) => res.json())
      .then((data) => {
        if (data.progress?.completedAt) {
          router.push("/dashboard");
        } else if (data.progress?.currentQuestionId) {
          setCurrentQuestionId(data.progress.currentQuestionId);
        }
      })
      .catch(console.error);
  }, [router]);

  const saveResponse = async (
    questionId: string,
    response: string | null,
    responseData: any
  ) => {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/onboarding/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId,
          response,
          responseData,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to save response");
      }

      return true;
    } catch (err) {
      setError("Failed to save. Please try again.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleNext = async () => {
    const question = currentQuestion;

    let response: string | null = null;
    let responseData: any = null;

    // Collect response based on question type
    if (question.type === "text" || question.type === "textarea") {
      response = textInput.trim();
      if (!response && !question.optional) {
        setError("Please provide an answer");
        return;
      }
    } else if (question.type === "multiple_choice") {
      if (selectedOptions.length === 0 && !showOther) {
        setError("Please select at least one option");
        return;
      }
      responseData = { selected: selectedOptions };
      if (showOther && otherText.trim()) {
        response = otherText.trim();
      }
    } else if (question.type === "forced_choice") {
      if (selectedOptions.length === 0 && !showOther) {
        setError("Please select an option");
        return;
      }
      responseData = { selected: selectedOptions[0] };
      if (showOther && otherText.trim()) {
        response = otherText.trim();
      }
    } else if (question.type === "slider") {
      responseData = { value: sliderValue };
      response = String(sliderValue);
    }

    // Check if we should ask follow-up for "Other"
    if (showOther && !askingFollowUp && question.otherPrompt && !otherText.trim()) {
      setAskingFollowUp(true);
      return;
    }

    // Save response
    const saved = await saveResponse(currentQuestionId, response, responseData);
    if (!saved) return;

    // Store locally
    setResponses({
      ...responses,
      [currentQuestionId]: { response, responseData },
    });

    // Move to next question
    const nextQuestionId = getNextQuestion(currentQuestionId);
    if (nextQuestionId) {
      // Update progress
      await fetch("/api/onboarding/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentQuestionId: nextQuestionId,
        }),
      });

      setCurrentQuestionId(nextQuestionId);
      resetInputs();
    } else {
      // Onboarding complete
      await fetch("/api/onboarding/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          completed: true,
        }),
      });

      // Trigger snapshot rebuild
      await fetch("/api/dashboard/snapshot", {
        method: "POST",
      });

      router.push("/dashboard");
    }
  };

  const handleSkip = async () => {
    if (!currentQuestion.optional) return;

    // Save empty response
    await saveResponse(currentQuestionId, null, null);

    // Move to next
    const nextQuestionId = getNextQuestion(currentQuestionId);
    if (nextQuestionId) {
      await fetch("/api/onboarding/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentQuestionId: nextQuestionId,
        }),
      });

      setCurrentQuestionId(nextQuestionId);
      resetInputs();
    }
  };

  const resetInputs = () => {
    setTextInput("");
    setSelectedOptions([]);
    setSliderValue(3);
    setShowOther(false);
    setOtherText("");
    setError(null);
    setAskingFollowUp(false);
  };

  const handleOptionToggle = (value: string) => {
    if (currentQuestion.type === "forced_choice") {
      setSelectedOptions([value]);
    } else {
      setSelectedOptions((prev) =>
        prev.includes(value)
          ? prev.filter((v) => v !== value)
          : [...prev, value]
      );
    }
  };

  if (!currentQuestion) {
    return <div style={{ minHeight: "100vh", background: "var(--bg-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "var(--text-primary)" }}>Loading...</p>
    </div>;
  }

  const promptToShow = askingFollowUp ? currentQuestion.otherPrompt : currentQuestion.prompt;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)", color: "var(--text-primary)", display: "flex", flexDirection: "column" }}>
      {/* Progress Bar */}
      <div style={{ width: "100%", height: "4px", background: "var(--bg-secondary)" }}>
        <div
          style={{ height: "100%", background: "var(--accent-primary)", transition: "width 0.3s" }}
          className="transition-all duration-300"
        />
      </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
        <div style={{ maxWidth: "800px", width: "100%" }}>
          {/* Question Number */}
          <div style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "8px" }}>
            Question {questionNumber} of {totalQuestions}
          </div>

          {/* Question Prompt */}
          <h1 style={{ fontSize: "1.875rem", fontWeight: 700, marginBottom: "32px", color: "var(--text-primary)" }}>
            {promptToShow}
          </h1>

          {/* Question Input */}
          <div style={{ marginBottom: "32px" }}>
            {currentQuestion.type === "text" && (
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "var(--radius-md)",
                  outline: "none",
                  color: "var(--text-primary)",
                  fontSize: "1rem",
                }}
                placeholder="Type your answer..."
                autoFocus
                onFocus={(e) => e.currentTarget.style.borderColor = "var(--border-active)"}
                onBlur={(e) => e.currentTarget.style.borderColor = "var(--border-color)"}
              />
            )}

            {currentQuestion.type === "textarea" && (
              <textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "var(--radius-md)",
                  outline: "none",
                  color: "var(--text-primary)",
                  minHeight: "120px",
                  fontSize: "1rem",
                  resize: "vertical",
                }}
                placeholder="Share your thoughts..."
                autoFocus
                onFocus={(e) => e.currentTarget.style.borderColor = "var(--border-active)"}
                onBlur={(e) => e.currentTarget.style.borderColor = "var(--border-color)"}
              />
            )}

            {(currentQuestion.type === "multiple_choice" ||
              currentQuestion.type === "forced_choice") &&
              !askingFollowUp && (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {currentQuestion.options?.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => handleOptionToggle(option.value)}
                      style={{
                        width: "100%",
                        padding: "16px 24px",
                        borderRadius: "var(--radius-md)",
                        border: `2px solid ${selectedOptions.includes(option.value) ? "var(--accent-primary)" : "var(--border-color)"}`,
                        background: selectedOptions.includes(option.value) ? "rgba(59, 130, 246, 0.1)" : "var(--bg-secondary)",
                        color: "var(--text-primary)",
                        textAlign: "left",
                        cursor: "pointer",
                        transition: "all 0.2s",
                        fontSize: "1rem",
                      }}
                      onMouseEnter={(e) => {
                        if (!selectedOptions.includes(option.value)) {
                          e.currentTarget.style.borderColor = "var(--text-muted)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!selectedOptions.includes(option.value)) {
                          e.currentTarget.style.borderColor = "var(--border-color)";
                        }
                      }}
                    >
                      {option.label}
                    </button>
                  ))}

                  {currentQuestion.allowOther && (
                    <button
                      onClick={() => setShowOther(!showOther)}
                      style={{
                        width: "100%",
                        padding: "16px 24px",
                        borderRadius: "var(--radius-md)",
                        border: `2px solid ${showOther ? "var(--accent-primary)" : "var(--border-color)"}`,
                        background: showOther ? "rgba(59, 130, 246, 0.1)" : "var(--bg-secondary)",
                        color: "var(--text-primary)",
                        textAlign: "left",
                        cursor: "pointer",
                        transition: "all 0.2s",
                        fontSize: "1rem",
                      }}
                      onMouseEnter={(e) => {
                        if (!showOther) {
                          e.currentTarget.style.borderColor = "var(--text-muted)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!showOther) {
                          e.currentTarget.style.borderColor = "var(--border-color)";
                        }
                      }}
                    >
                      Other
                    </button>
                  )}

                  {showOther && !askingFollowUp && (
                    <input
                      type="text"
                      value={otherText}
                      onChange={(e) => setOtherText(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "12px 16px",
                        background: "var(--bg-secondary)",
                        border: "1px solid var(--border-color)",
                        borderRadius: "var(--radius-md)",
                        outline: "none",
                        color: "var(--text-primary)",
                        marginTop: "8px",
                        fontSize: "1rem",
                      }}
                      placeholder="Please specify..."
                      autoFocus
                      onFocus={(e) => e.currentTarget.style.borderColor = "var(--border-active)"}
                      onBlur={(e) => e.currentTarget.style.borderColor = "var(--border-color)"}
                    />
                  )}
                </div>
              )}

            {currentQuestion.type === "slider" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <input
                  type="range"
                  min={currentQuestion.min}
                  max={currentQuestion.max}
                  value={sliderValue}
                  onChange={(e) => setSliderValue(parseInt(e.target.value))}
                  style={{
                    width: "100%",
                    height: "8px",
                    background: "var(--bg-secondary)",
                    borderRadius: "var(--radius-md)",
                    appearance: "none",
                    cursor: "pointer",
                  }}
                  className="slider"
                />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem", color: "var(--text-muted)" }}>
                  <span>{currentQuestion.labels?.min}</span>
                  <span style={{ color: "var(--text-primary)", fontWeight: 600, fontSize: "1.125rem" }}>
                    {sliderValue}
                  </span>
                  <span>{currentQuestion.labels?.max}</span>
                </div>
              </div>
            )}

            {askingFollowUp && (
              <textarea
                value={otherText}
                onChange={(e) => setOtherText(e.target.value)}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "var(--radius-md)",
                  outline: "none",
                  color: "var(--text-primary)",
                  minHeight: "120px",
                  fontSize: "1rem",
                  resize: "vertical",
                }}
                placeholder="Tell me more..."
                autoFocus
                onFocus={(e) => e.currentTarget.style.borderColor = "var(--border-active)"}
                onBlur={(e) => e.currentTarget.style.borderColor = "var(--border-color)"}
              />
            )}
          </div>

          {/* Error */}
          {error && (
            <div style={{
              marginBottom: "16px",
              padding: "12px",
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: "var(--radius-md)",
              color: "#ef4444",
              fontSize: "0.875rem",
            }}>
              {error}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: "16px" }}>
            <button
              onClick={handleNext}
              disabled={saving}
              style={{
                flex: 1,
                padding: "14px 24px",
                background: saving ? "var(--bg-glass)" : "var(--accent-primary)",
                color: saving ? "var(--text-muted)" : "white",
                borderRadius: "var(--radius-md)",
                border: "none",
                fontWeight: 500,
                cursor: saving ? "not-allowed" : "pointer",
                transition: "all 0.2s",
                fontSize: "1rem",
              }}
              onMouseEnter={(e) => {
                if (!saving) e.currentTarget.style.background = "var(--accent-primary-hover)";
              }}
              onMouseLeave={(e) => {
                if (!saving) e.currentTarget.style.background = "var(--accent-primary)";
              }}
            >
              {saving ? "Saving..." : questionNumber === totalQuestions ? "Complete" : "Next"}
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: var(--accent-primary);
          cursor: pointer;
        }
        .slider::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: var(--accent-primary);
          cursor: pointer;
          border: none;
        }
      `}</style>
    </div>
  );
}
