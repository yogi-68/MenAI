"use client";

/**
 * Onboarding Flow Component
 * Multi-stage questionnaire with one-question-at-a-time flow
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
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
  const completionRedirectedRef = useRef(false);
  const [askingFollowUp, setAskingFollowUp] = useState(false);

  const currentQuestion = ONBOARDING_QUESTIONS[currentQuestionId];
  const questionNumber = getQuestionNumber(currentQuestionId);
  const totalQuestions = getTotalQuestions();
  const progress = (questionNumber / totalQuestions) * 100;

  // Prevent hydration errors with a mounted check
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    let wasReset = false;

    fetch("/api/auth/bootstrap", { method: "POST" })
      .then((res) => res.json())
      .then((bootstrap) => {
        wasReset = !!bootstrap.onboardingReset;
        if (wasReset) {
          setCurrentQuestionId("Q1");
          setResponses({});
          resetInputs();
        }
        return fetch("/api/onboarding/progress");
      })
      .then((res) => res?.json())
      .then((data) => {
        if (!data) return;
        if (data.progress?.completedAt) {
          if (!completionRedirectedRef.current) {
            completionRedirectedRef.current = true;
            router.replace("/dashboard");
          }
        } else if (data.progress?.currentQuestionId && !wasReset) {
          const nextId = data.progress.currentQuestionId;
          setCurrentQuestionId(
            QUESTION_ORDER.includes(nextId) ? nextId : "Q1"
          );
        }
      })
      .catch(console.error);
  }, [router]);

  // NOTE: Keyboard shortcut (Enter to advance) intentionally removed.
  // Steps only advance when the user clicks Continue / selects a forced-choice option.

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

  const handleNext = async (autoOptionValue?: string) => {
    if (saving) return;
    
    const question = currentQuestion;

    let response: string | null = null;
    let responseData: any = null;

    // Support for auto-advancing forced choice
    const activeSelectedOptions = autoOptionValue ? [autoOptionValue] : selectedOptions;

    // Collect response based on question type
    if (question.type === "text" || question.type === "textarea") {
      response = textInput.trim();
      if (!response && !question.optional) {
        setError("Please provide an answer");
        return;
      }
    } else if (question.type === "multiple_choice") {
      if (activeSelectedOptions.length === 0 && !showOther) {
        setError("Please select at least one option");
        return;
      }
      responseData = { selected: activeSelectedOptions };
      if (showOther && otherText.trim()) {
        response = otherText.trim();
      }
    } else if (question.type === "forced_choice") {
      if (activeSelectedOptions.length === 0 && !showOther) {
        setError("Please select an option");
        return;
      }
      responseData = { selected: activeSelectedOptions[0] };
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
      // Background update progress
      fetch("/api/onboarding/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentQuestionId: nextQuestionId,
        }),
      }).catch(console.error);

      resetInputs();
      setCurrentQuestionId(nextQuestionId);
    } else {
      // Onboarding complete — guard against double-fire
      if (completionRedirectedRef.current) return;
      completionRedirectedRef.current = true;

      setSaving(true);
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

      router.replace("/dashboard/plans");
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
    setError(null);
  };

  const canContinue =
    currentQuestion.type === "text" || currentQuestion.type === "textarea"
      ? currentQuestion.optional || textInput.trim().length > 0
      : currentQuestion.type === "slider"
        ? true
        : askingFollowUp
          ? otherText.trim().length > 0
          : showOther && currentQuestion.allowOther
            ? otherText.trim().length > 0 || selectedOptions.length > 0
            : selectedOptions.length > 0;

  if (!isMounted || !currentQuestion) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="skeleton" style={{ height: "40px", width: "200px", borderRadius: "var(--radius-md)" }} />
      </div>
    );
  }

  const promptToShow = askingFollowUp ? currentQuestion.otherPrompt : currentQuestion.prompt;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)", color: "var(--text-primary)", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
      {/* Ambient Background Effects */}
      <div className="ambient-bg" />

      {/* Progress Bar Header */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 10 }}>
        <div style={{ width: "100%", height: "4px", background: "var(--bg-secondary)" }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            style={{ height: "100%", background: "var(--accent-primary)" }}
          />
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", position: "relative", zIndex: 10 }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={currentQuestionId + (askingFollowUp ? "-followup" : "")}
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.98 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            style={{ width: "100%", maxWidth: "600px" }}
          >
            <div className="glass-card" style={{ padding: "40px", display: "flex", flexDirection: "column", gap: "24px" }}>
              {/* Question Context */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "var(--accent-primary)", fontSize: "0.85rem", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                  Question {questionNumber} of {totalQuestions}
                </span>
                {currentQuestion.optional && (
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", border: "1px solid var(--border-color)", padding: "2px 8px", borderRadius: "12px" }}>
                    Optional
                  </span>
                )}
              </div>

              {/* Question Prompt */}
              <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.3, margin: 0 }}>
                {promptToShow}
              </h1>
              {!askingFollowUp && currentQuestion.subtitle && (
                <p style={{ fontSize: "0.95rem", color: "var(--text-muted)", lineHeight: 1.6, margin: 0 }}>
                  {currentQuestion.subtitle}
                </p>
              )}

              {/* Input Area */}
              <div style={{ marginTop: "8px" }}>
                {currentQuestion.type === "text" && (
                  <input
                    type="text"
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    className="input-field"
                    style={{
                      width: "100%",
                      padding: "16px 20px",
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "var(--radius-md)",
                      color: "var(--text-primary)",
                      fontSize: "1.1rem",
                      outline: "none",
                      transition: "border-color 0.2s ease, background 0.2s ease",
                    }}
                    placeholder="Type your answer..."
                    autoFocus
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "var(--border-active)";
                      e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "var(--border-color)";
                      e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                    }}
                  />
                )}

                {currentQuestion.type === "textarea" && (
                  <textarea
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    className="input-field"
                    style={{
                      width: "100%",
                      padding: "16px 20px",
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "var(--radius-md)",
                      color: "var(--text-primary)",
                      minHeight: "140px",
                      fontSize: "1.1rem",
                      resize: "vertical",
                      outline: "none",
                      transition: "border-color 0.2s ease, background 0.2s ease",
                    }}
                    placeholder="Share your thoughts..."
                    autoFocus
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "var(--border-active)";
                      e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "var(--border-color)";
                      e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                    }}
                  />
                )}

                {(currentQuestion.type === "multiple_choice" ||
                  currentQuestion.type === "forced_choice") &&
                  !askingFollowUp && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      {currentQuestion.options?.map((option) => {
                        const isSelected = selectedOptions.includes(option.value);
                        return (
                          <motion.button
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.98 }}
                            key={option.value}
                            onClick={() => handleOptionToggle(option.value)}
                            style={{
                              width: "100%",
                              padding: "18px 24px",
                              borderRadius: "var(--radius-md)",
                              border: `1.5px solid ${isSelected ? "var(--accent-primary)" : "var(--border-color)"}`,
                              background: isSelected ? "var(--accent-primary-transparent)" : "rgba(255,255,255,0.02)",
                              color: isSelected ? "var(--text-primary)" : "var(--text-secondary)",
                              textAlign: "left",
                              cursor: "pointer",
                              transition: "all 0.2s ease",
                              fontSize: "1.05rem",
                              fontWeight: isSelected ? 600 : 500,
                              boxShadow: isSelected ? "0 4px 12px rgba(59, 130, 246, 0.15)" : "none",
                            }}
                          >
                            {option.label}
                          </motion.button>
                        );
                      })}

                      {currentQuestion.allowOther && (
                        <motion.button
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => setShowOther(!showOther)}
                          style={{
                            width: "100%",
                            padding: "18px 24px",
                            borderRadius: "var(--radius-md)",
                            border: `1.5px solid ${showOther ? "var(--accent-primary)" : "var(--border-color)"}`,
                            background: showOther ? "var(--accent-primary-transparent)" : "rgba(255,255,255,0.02)",
                            color: showOther ? "var(--text-primary)" : "var(--text-secondary)",
                            textAlign: "left",
                            cursor: "pointer",
                            transition: "all 0.2s ease",
                            fontSize: "1.05rem",
                            fontWeight: showOther ? 600 : 500,
                          }}
                        >
                          Other...
                        </motion.button>
                      )}

                      <AnimatePresence>
                        {showOther && !askingFollowUp && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            style={{ overflow: "hidden", marginTop: "4px" }}
                          >
                            <input
                              type="text"
                              value={otherText}
                              onChange={(e) => setOtherText(e.target.value)}
                              style={{
                                width: "100%",
                                padding: "16px 20px",
                                background: "rgba(255,255,255,0.03)",
                                border: "1px solid var(--border-color)",
                                borderRadius: "var(--radius-md)",
                                color: "var(--text-primary)",
                                fontSize: "1.05rem",
                                outline: "none",
                              }}
                              placeholder="Please specify..."
                              autoFocus
                              onFocus={(e) => e.currentTarget.style.borderColor = "var(--border-active)"}
                              onBlur={(e) => e.currentTarget.style.borderColor = "var(--border-color)"}
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}

                {currentQuestion.type === "slider" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "24px", padding: "20px 10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                      <span style={{ fontSize: "0.9rem", color: "var(--text-muted)", fontWeight: 500 }}>{currentQuestion.labels?.min}</span>
                      <motion.div 
                        key={sliderValue}
                        initial={{ scale: 1.2, opacity: 0.8 }}
                        animate={{ scale: 1, opacity: 1 }}
                        style={{ color: "var(--accent-primary)", fontWeight: 700, fontSize: "2rem", lineHeight: 1 }}
                      >
                        {sliderValue}
                      </motion.div>
                      <span style={{ fontSize: "0.9rem", color: "var(--text-muted)", fontWeight: 500 }}>{currentQuestion.labels?.max}</span>
                    </div>
                    
                    <input
                      type="range"
                      min={currentQuestion.min}
                      max={currentQuestion.max}
                      value={sliderValue}
                      onChange={(e) => setSliderValue(parseInt(e.target.value))}
                      style={{
                        width: "100%",
                        height: "8px",
                        background: "rgba(255,255,255,0.1)",
                        borderRadius: "var(--radius-md)",
                        appearance: "none",
                        cursor: "pointer",
                      }}
                      className="custom-slider"
                    />
                  </div>
                )}

                {askingFollowUp && (
                  <textarea
                    value={otherText}
                    onChange={(e) => setOtherText(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "16px 20px",
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "var(--radius-md)",
                      color: "var(--text-primary)",
                      minHeight: "140px",
                      fontSize: "1.1rem",
                      resize: "vertical",
                      outline: "none",
                    }}
                    placeholder="Tell me more..."
                    autoFocus
                    onFocus={(e) => e.currentTarget.style.borderColor = "var(--border-active)"}
                    onBlur={(e) => e.currentTarget.style.borderColor = "var(--border-color)"}
                  />
                )}
              </div>

              {/* Error Message */}
              <AnimatePresence>
                {error && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }} 
                    animate={{ opacity: 1, y: 0 }} 
                    exit={{ opacity: 0 }}
                    style={{
                      padding: "12px 16px",
                      background: "rgba(239, 68, 68, 0.1)",
                      border: "1px solid rgba(239, 68, 68, 0.3)",
                      borderRadius: "var(--radius-md)",
                      color: "#ef4444",
                      fontSize: "0.9rem",
                      fontWeight: 500,
                    }}
                  >
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Action Buttons — always require explicit Continue */}
              <div style={{ display: "flex", gap: "16px", marginTop: "16px", alignItems: "center" }}>
                {(currentQuestion.type === "multiple_choice" ||
                  currentQuestion.type === "forced_choice") &&
                  selectedOptions.length > 0 && (
                    <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                      {currentQuestion.type === "multiple_choice"
                        ? `${selectedOptions.length} selected — click Continue when ready`
                        : "Click Continue to confirm your choice"}
                    </span>
                  )}
                <motion.button
                  whileHover={{ scale: saving || !canContinue ? 1 : 1.02 }}
                  whileTap={{ scale: saving || !canContinue ? 1 : 0.98 }}
                  onClick={() => handleNext()}
                  disabled={saving || !canContinue}
                  className="btn-primary"
                  style={{
                    flex: 1,
                    padding: "16px 24px",
                    opacity: saving || !canContinue ? 0.5 : 1,
                    cursor: saving || !canContinue ? "not-allowed" : "pointer",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                  }}
                >
                  {saving ? "Saving..." : questionNumber === totalQuestions ? "Complete Setup" : "Continue"}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <style jsx>{`
        .custom-slider::-webkit-slider-thumb {
          appearance: none;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: var(--accent-primary);
          cursor: pointer;
          border: 4px solid var(--bg-primary);
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          transition: transform 0.1s;
        }
        .custom-slider::-webkit-slider-thumb:hover {
          transform: scale(1.15);
        }
        .custom-slider::-moz-range-thumb {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: var(--accent-primary);
          cursor: pointer;
          border: 4px solid var(--bg-primary);
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          transition: transform 0.1s;
        }
        .custom-slider::-moz-range-thumb:hover {
          transform: scale(1.15);
        }
      `}</style>
    </div>
  );
}
