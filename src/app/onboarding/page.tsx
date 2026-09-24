"use client";

/**
 * Intake.
 *
 * One question at a time, seven questions, with a Back button — the previous
 * version had none, so anyone who mistyped their goal on the first screen was
 * stuck with it.
 *
 * The flow itself lives in @/lib/onboarding/questions and branches on what
 * has been answered, so the count in the header can change mid-flow. That is
 * intentional: someone who has already said they are running on empty should
 * not then be asked what drains them.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import {
  ONBOARDING_QUESTIONS,
  ONBOARDING_STEP_LABELS,
  getNextQuestion,
  getPreviousQuestion,
  getQuestionNumber,
  getStepLabelIndex,
  getTotalQuestions,
  isValidQuestionId,
  type OnboardingResponseMap,
} from "@/lib/onboarding/questions";
import { STATE_SCALE } from "@/lib/mind/state-scale";
import { BRAND } from "@/lib/product/brand";
import { FinalizeProgress } from "@/components/onboarding/finalize-progress";

/** What each stated obstacle changes about the plan. Shown as a live preview. */
const OBSTACLE_PREVIEW: Record<string, { approach: string; taskType: string }> = {
  overthinking: { approach: "Decide once, then move", taskType: "3 concrete tasks a day" },
  procrastination: { approach: "Smallest next step first", taskType: "3 concrete tasks a day" },
  burnout: { approach: "Sized to your energy", taskType: "Fewer tasks on low days" },
  scattered_focus: { approach: "One thing at a time", taskType: "3 focused tasks a day" },
  scattered_focus_priorities: { approach: "One thing at a time", taskType: "3 focused tasks a day" },
  lack_of_time: { approach: "Protect one deep block", taskType: "3 high-leverage tasks" },
  avoidance: { approach: "Ship before it's perfect", taskType: "3 concrete tasks a day" },
  inconsistency: { approach: "Rhythm over intensity", taskType: "3 repeatable tasks a day" },
};

const FIRST_QUESTION = "Q1";

interface StoredResponse {
  response: string | null;
  responseData: { selected?: string | string[]; value?: number } | null;
}

export default function OnboardingPage() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();

  const [currentQuestionId, setCurrentQuestionId] = useState(FIRST_QUESTION);
  const [responses, setResponses] = useState<Record<string, StoredResponse>>({});

  const [textInput, setTextInput] = useState("");
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [scaleValue, setScaleValue] = useState(5);
  const [showOther, setShowOther] = useState(false);
  const [otherText, setOtherText] = useState("");
  const [customDate, setCustomDate] = useState("");

  const [saving, setSaving] = useState(false);
  const [validatingGoal, setValidatingGoal] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [askingFollowUp, setAskingFollowUp] = useState(false);

  const [goalBlocked, setGoalBlocked] = useState<{
    message: string;
    suggestions: string[];
  } | null>(null);
  const [goalWeak, setGoalWeak] = useState<{
    message: string;
    sharpenPrompt: string;
    sharpenOptions: Array<{ value: string; label: string; resultTitle: string }>;
    quality?: string;
  } | null>(null);
  const [sharpenConfirmed, setSharpenConfirmed] = useState(false);
  const [keepBroadGoal, setKeepBroadGoal] = useState(false);

  const [isMounted, setIsMounted] = useState(false);
  const completionRedirected = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const flowResponses = responses as OnboardingResponseMap;
  const currentQuestion = ONBOARDING_QUESTIONS[currentQuestionId];
  const questionNumber = getQuestionNumber(currentQuestionId, flowResponses);
  const totalQuestions = getTotalQuestions(flowResponses);
  const progress = (questionNumber / totalQuestions) * 100;
  const previousQuestionId = getPreviousQuestion(currentQuestionId, flowResponses);

  const isDeadlineQuestion = currentQuestionId === "Q2";
  const wantsCustomDate = isDeadlineQuestion && selectedOptions.includes("custom");
  const wantsFlexible = isDeadlineQuestion && selectedOptions.includes("flexible");

  const resetInputs = useCallback(() => {
    setTextInput("");
    setSelectedOptions([]);
    setScaleValue(5);
    setShowOther(false);
    setOtherText("");
    setCustomDate("");
    setGoalBlocked(null);
    setGoalWeak(null);
    setSharpenConfirmed(false);
    setKeepBroadGoal(false);
    setError(null);
    setAskingFollowUp(false);
  }, []);

  /** Restore the inputs for a question already answered, so Back shows it. */
  const restoreInputs = useCallback(
    (questionId: string) => {
      resetInputs();
      const stored = responses[questionId];
      if (!stored) return;

      const question = ONBOARDING_QUESTIONS[questionId];
      if (!question) return;

      if (question.type === "text") {
        setTextInput(stored.response ?? "");
      } else if (question.type === "scale") {
        // Number() yields NaN rather than null for a non-numeric string, so
        // the fallback has to test for a finite number rather than nullishness.
        const storedNumeric = Number(stored.response);
        setScaleValue(
          stored.responseData?.value ??
            (Number.isFinite(storedNumeric) ? storedNumeric : 5)
        );
      } else {
        const selected = stored.responseData?.selected;
        setSelectedOptions(Array.isArray(selected) ? selected : selected ? [selected] : []);
        if (questionId === "Q2" && stored.response) setCustomDate(stored.response);
      }
    },
    [responses, resetInputs]
  );

  useEffect(() => {
    setIsMounted(true);
    let wasReset = false;

    fetch("/api/auth/bootstrap", { method: "POST" })
      .then((res) => res.json())
      .then((bootstrap) => {
        wasReset = Boolean(bootstrap.onboardingReset);
        if (wasReset) {
          setCurrentQuestionId(FIRST_QUESTION);
          setResponses({});
          resetInputs();
        }
        return fetch("/api/onboarding/progress");
      })
      .then((res) => res?.json())
      .then((data) => {
        if (!data) return;
        if (data.progress?.completedAt) {
          if (!completionRedirected.current) {
            completionRedirected.current = true;
            router.replace("/dashboard");
          }
          return;
        }
        const nextId = data.progress?.currentQuestionId;
        if (nextId && !wasReset) {
          setCurrentQuestionId(isValidQuestionId(nextId) ? nextId : FIRST_QUESTION);
        }
      })
      .catch(() => setError("We couldn't load your progress. Refresh to try again."));
  }, [router, resetInputs]);

  // Move focus to the input on each new question, so keyboard users don't
  // have to tab in from the top every time.
  useEffect(() => {
    if (currentQuestion?.type === "text") inputRef.current?.focus();
  }, [currentQuestionId, currentQuestion?.type, askingFollowUp]);

  const saveResponse = useCallback(
    async (questionId: string, response: string | null, responseData: unknown) => {
      setSaving(true);
      setError(null);
      try {
        const res = await fetch("/api/onboarding/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questionId, response, responseData }),
        });
        if (!res.ok) throw new Error("save failed");
        return true;
      } catch {
        setError("We couldn't save that. Check your connection and try again.");
        return false;
      } finally {
        setSaving(false);
      }
    },
    []
  );

  /** Ask the server whether this goal is concrete enough to plan against. */
  const validateGoal = useCallback(
    async (title: string): Promise<boolean> => {
      setValidatingGoal(true);
      try {
        const res = await fetch("/api/onboarding/validate-initiative", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, directions: [], buildingWhat: null }),
        });
        const data = await res.json();

        if (!data.valid) {
          setGoalBlocked({ message: data.message, suggestions: data.suggestions ?? [] });
          setGoalWeak(null);
          setError(data.message);
          return false;
        }

        if (data.needsSharpening) {
          const isBroad = data.quality === "broad";
          if (!sharpenConfirmed && !(isBroad && keepBroadGoal)) {
            setGoalWeak({
              message: data.message || "Let's make this specific enough to plan against.",
              sharpenPrompt: data.sharpenPrompt || "What kind of outcome is this?",
              sharpenOptions: data.sharpenOptions ?? [],
              quality: data.quality,
            });
            setGoalBlocked(null);
            setError(null);
            return false;
          }
        }

        setGoalBlocked(null);
        setGoalWeak(null);
        return true;
      } catch {
        // A validator outage must not block someone from starting.
        return true;
      } finally {
        setValidatingGoal(false);
      }
    },
    [sharpenConfirmed, keepBroadGoal]
  );

  const handleBack = useCallback(() => {
    if (!previousQuestionId || saving) return;
    setCurrentQuestionId(previousQuestionId);
    restoreInputs(previousQuestionId);
    fetch("/api/onboarding/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentQuestionId: previousQuestionId }),
    }).catch(() => {});
  }, [previousQuestionId, saving, restoreInputs]);

  const handleNext = useCallback(
    async (autoOptionValue?: string) => {
      if (saving || !currentQuestion) return;

      const chosen = autoOptionValue ? [autoOptionValue] : selectedOptions;
      let response: string | null = null;
      let responseData: StoredResponse["responseData"] = null;

      if (currentQuestion.type === "text") {
        response = textInput.trim();
        if (!response && !currentQuestion.optional) {
          setError("Give this a moment of thought, then answer.");
          return;
        }
      } else if (currentQuestion.type === "scale") {
        responseData = { value: scaleValue };
        response = String(scaleValue);
      } else {
        if (chosen.length === 0 && !showOther) {
          setError("Pick the one that fits best.");
          return;
        }
        if (isDeadlineQuestion && chosen[0] === "custom" && !customDate.trim()) {
          setError("Choose a date.");
          return;
        }
        responseData = { selected: chosen[0] };
        if (isDeadlineQuestion && chosen[0] === "custom") response = customDate.trim();
        if (showOther && otherText.trim()) response = otherText.trim();
      }

      // "Other" needs its follow-up before we can move on.
      if (showOther && !askingFollowUp && currentQuestion.otherPrompt && !otherText.trim()) {
        setAskingFollowUp(true);
        return;
      }

      if (currentQuestionId === "Q1" && response) {
        const ok = await validateGoal(response);
        if (!ok) return;
      }

      if (currentQuestionId === "Q4" && response) {
        const measurable =
          /\d/.test(response) ||
          /\b(launch|client|clients|kg|lb|users|revenue|beta|first|complete|finish|pass|ship|reach|get|lose|gain|hired|offer)\b/i.test(
            response
          );
        if (!measurable) {
          setError("Give it an edge we can measure — a number, or a thing that either shipped or didn't.");
          return;
        }
      }

      const saved = await saveResponse(currentQuestionId, response, responseData);
      if (!saved) return;

      const updated = { ...responses, [currentQuestionId]: { response, responseData } };
      setResponses(updated);

      const nextQuestionId = getNextQuestion(currentQuestionId, updated as OnboardingResponseMap);

      if (!nextQuestionId) {
        if (completionRedirected.current) return;
        completionRedirected.current = true;
        setFinalizing(true);
        return;
      }

      fetch("/api/onboarding/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentQuestionId: nextQuestionId }),
      }).catch(() => {});

      resetInputs();
      setCurrentQuestionId(nextQuestionId);
    },
    [
      saving,
      currentQuestion,
      currentQuestionId,
      selectedOptions,
      textInput,
      scaleValue,
      showOther,
      otherText,
      customDate,
      isDeadlineQuestion,
      askingFollowUp,
      responses,
      saveResponse,
      validateGoal,
      resetInputs,
    ]
  );

  const handleOptionSelect = (value: string) => {
    setSelectedOptions([value]);
    setError(null);
  };

  const canContinue = useMemo(() => {
    if (goalWeak) return false;
    if (!currentQuestion) return false;
    if (currentQuestion.type === "text") {
      return currentQuestion.optional || textInput.trim().length > 0;
    }
    if (currentQuestion.type === "scale") return true;
    if (wantsCustomDate) return customDate.trim().length > 0;
    if (askingFollowUp) return otherText.trim().length > 0;
    if (showOther && currentQuestion.allowOther) {
      return otherText.trim().length > 0 || selectedOptions.length > 0;
    }
    return selectedOptions.length > 0;
  }, [
    goalWeak,
    currentQuestion,
    textInput,
    wantsCustomDate,
    customDate,
    askingFollowUp,
    otherText,
    showOther,
    selectedOptions,
  ]);

  if (finalizing) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg-primary)", color: "var(--text-primary)" }}>
        <FinalizeProgress />
      </div>
    );
  }

  if (!isMounted || !currentQuestion) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "var(--bg-primary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div className="skeleton" style={{ height: 40, width: 200, borderRadius: "var(--radius-md)" }} />
        <span className="sr-only">Loading</span>
      </div>
    );
  }

  const prompt = askingFollowUp ? currentQuestion.otherPrompt : currentQuestion.prompt;
  const stepIndex = getStepLabelIndex(currentQuestionId);
  const selectedScale = STATE_SCALE.find((s) => s.score === scaleValue);
  const obstaclePreview = currentQuestionId === "Q3" ? OBSTACLE_PREVIEW[selectedOptions[0]] : null;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-primary)",
        color: "var(--text-primary)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header style={{ position: "sticky", top: 0, zIndex: 10, background: "var(--bg-primary)" }}>
        <div
          role="progressbar"
          aria-valuenow={questionNumber}
          aria-valuemin={1}
          aria-valuemax={totalQuestions}
          aria-label={`Question ${questionNumber} of ${totalQuestions}`}
          style={{ width: "100%", height: 4, background: "var(--bg-secondary)" }}
        >
          <motion.div
            initial={false}
            animate={{ width: `${progress}%` }}
            transition={{ duration: reduceMotion ? 0 : 0.35, ease: "easeOut" }}
            style={{ height: "100%", background: "var(--accent-primary)" }}
          />
        </div>

        {/* Step labels are decorative on small screens — the progress bar and
            the "Question N of M" line carry the same information. */}
        <ol
          aria-hidden="true"
          className="onboarding-steps"
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 4,
            padding: "10px 24px 0",
            maxWidth: 640,
            margin: "0 auto",
            listStyle: "none",
          }}
        >
          {ONBOARDING_STEP_LABELS.map((label, i) => (
            <li
              key={label}
              style={{
                fontSize: "0.65rem",
                fontWeight: i <= stepIndex ? 600 : 500,
                color: i <= stepIndex ? "var(--accent-primary)" : "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </li>
          ))}
        </ol>
      </header>

      <main
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={currentQuestionId + (askingFollowUp ? "-followup" : "")}
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -16 }}
            transition={{ duration: reduceMotion ? 0 : 0.22, ease: "easeInOut" }}
            style={{ width: "100%", maxWidth: 600 }}
          >
            <div
              className="card"
              style={{ padding: "clamp(24px, 5vw, 40px)", display: "flex", flexDirection: "column", gap: 24 }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <span
                  style={{
                    color: "var(--accent-primary)",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                  }}
                >
                  Question {questionNumber} of {totalQuestions}
                </span>

                {previousQuestionId && !askingFollowUp && (
                  <button
                    type="button"
                    onClick={handleBack}
                    disabled={saving}
                    aria-label="Go back to the previous question"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      background: "none",
                      border: "none",
                      color: "var(--text-secondary)",
                      fontSize: "0.85rem",
                      cursor: saving ? "not-allowed" : "pointer",
                      padding: "6px 8px",
                      borderRadius: "var(--radius-md)",
                    }}
                  >
                    <ArrowLeft size={14} aria-hidden="true" />
                    Back
                  </button>
                )}
              </div>

              <h1
                id="onboarding-question"
                style={{ fontSize: "clamp(1.4rem, 4vw, 1.75rem)", fontWeight: 700, lineHeight: 1.3, margin: 0 }}
              >
                {prompt}
              </h1>

              {!askingFollowUp && currentQuestion.subtitle && (
                <p style={{ fontSize: "0.95rem", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
                  {currentQuestion.subtitle}
                </p>
              )}

              {/* ---- Goal blocked ------------------------------------------------ */}
              {goalBlocked && (
                <div
                  style={{
                    padding: 16,
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--accent-warning, #f59e0b)",
                    background: "rgba(245,158,11,0.08)",
                  }}
                >
                  <p style={{ margin: "0 0 12px", fontSize: "0.9rem" }}>{goalBlocked.message}</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {goalBlocked.suggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => {
                          setTextInput(suggestion);
                          setGoalBlocked(null);
                          setError(null);
                        }}
                        className="chip"
                        style={{ cursor: "pointer" }}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ---- Goal needs sharpening --------------------------------------- */}
              {goalWeak && (
                <div
                  style={{
                    padding: 16,
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-color)",
                    background: "var(--bg-secondary)",
                  }}
                >
                  <p style={{ margin: "0 0 8px", fontSize: "0.9rem" }}>{goalWeak.message}</p>
                  <p style={{ margin: "0 0 12px", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                    {goalWeak.sharpenPrompt}
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {goalWeak.sharpenOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setTextInput(option.resultTitle);
                          setSharpenConfirmed(true);
                          setGoalWeak(null);
                        }}
                        className="chip"
                        style={{ cursor: "pointer" }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  {goalWeak.quality === "broad" && (
                    <button
                      type="button"
                      onClick={() => {
                        setKeepBroadGoal(true);
                        setGoalWeak(null);
                      }}
                      style={{
                        marginTop: 12,
                        background: "none",
                        border: "none",
                        color: "var(--text-secondary)",
                        fontSize: "0.85rem",
                        textDecoration: "underline",
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      Keep &ldquo;{textInput.trim()}&rdquo; and carry on
                    </button>
                  )}
                </div>
              )}

              {/* ---- Inputs ------------------------------------------------------ */}
              {(currentQuestion.type === "text" || askingFollowUp) && (
                <div>
                  <label htmlFor="onboarding-answer" className="sr-only">
                    {prompt}
                  </label>
                  <input
                    id="onboarding-answer"
                    ref={inputRef}
                    type="text"
                    value={askingFollowUp ? otherText : textInput}
                    onChange={(e) =>
                      askingFollowUp ? setOtherText(e.target.value) : setTextInput(e.target.value)
                    }
                    className="input-field"
                    placeholder="Type your answer"
                    aria-describedby={error ? "onboarding-error" : undefined}
                    style={{ width: "100%", padding: "16px 20px", fontSize: "1.05rem" }}
                  />
                </div>
              )}

              {currentQuestion.type === "scale" && !askingFollowUp && (
                <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
                  <legend className="sr-only">{currentQuestion.prompt}</legend>
                  <div
                    role="radiogroup"
                    aria-label={currentQuestion.prompt}
                    style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
                  >
                    {STATE_SCALE.map((option) => {
                      const isSelected = scaleValue === option.score;
                      return (
                        <button
                          key={option.score}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          aria-label={`${option.score} out of 10, ${option.label}`}
                          onClick={() => setScaleValue(option.score)}
                          style={{
                            flex: "1 1 40px",
                            minWidth: 40,
                            minHeight: 48,
                            borderRadius: "var(--radius-md)",
                            border: `1.5px solid ${isSelected ? "var(--accent-primary)" : "var(--border-color)"}`,
                            background: isSelected
                              ? "var(--accent-primary-transparent)"
                              : "var(--bg-secondary)",
                            color: isSelected ? "var(--text-primary)" : "var(--text-secondary)",
                            fontWeight: isSelected ? 700 : 500,
                            fontSize: "1rem",
                            cursor: "pointer",
                          }}
                        >
                          {option.score}
                        </button>
                      );
                    })}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginTop: 8,
                      fontSize: "0.75rem",
                      color: "var(--text-secondary)",
                    }}
                  >
                    <span>{currentQuestion.labels?.min}</span>
                    <span>{currentQuestion.labels?.max}</span>
                  </div>

                  {selectedScale && (
                    <p
                      aria-live="polite"
                      style={{
                        marginTop: 16,
                        fontSize: "0.9rem",
                        color: "var(--text-primary)",
                      }}
                    >
                      <strong>{selectedScale.label}.</strong>{" "}
                      <span style={{ color: "var(--text-secondary)" }}>{selectedScale.capacity}</span>
                    </p>
                  )}
                </fieldset>
              )}

              {currentQuestion.type === "forced_choice" && !askingFollowUp && (
                <div
                  role="radiogroup"
                  aria-labelledby="onboarding-question"
                  style={{ display: "flex", flexDirection: "column", gap: 10 }}
                >
                  {currentQuestion.options?.map((option) => {
                    const isSelected = selectedOptions.includes(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => handleOptionSelect(option.value)}
                        style={{
                          width: "100%",
                          minHeight: 52,
                          padding: "16px 20px",
                          borderRadius: "var(--radius-md)",
                          border: `1.5px solid ${isSelected ? "var(--accent-primary)" : "var(--border-color)"}`,
                          background: isSelected
                            ? "var(--accent-primary-transparent)"
                            : "var(--bg-secondary)",
                          color: isSelected ? "var(--text-primary)" : "var(--text-secondary)",
                          textAlign: "left",
                          cursor: "pointer",
                          fontSize: "1rem",
                          fontWeight: isSelected ? 600 : 500,
                        }}
                      >
                        {option.label}
                      </button>
                    );
                  })}

                  {wantsCustomDate && (
                    <div style={{ marginTop: 4 }}>
                      <label htmlFor="onboarding-date" className="sr-only">
                        Target date
                      </label>
                      <input
                        id="onboarding-date"
                        type="date"
                        value={customDate}
                        min={new Date().toISOString().split("T")[0]}
                        onChange={(e) => setCustomDate(e.target.value)}
                        className="input-field"
                        style={{ width: "100%", padding: "14px 18px" }}
                      />
                    </div>
                  )}

                  {wantsFlexible && (
                    <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", margin: "4px 0 0" }}>
                      Fine. {BRAND.name} will plan week by week and ask again when a date starts to matter.
                    </p>
                  )}

                  {currentQuestion.allowOther && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowOther(true);
                        setSelectedOptions([]);
                        setAskingFollowUp(true);
                      }}
                      style={{
                        alignSelf: "flex-start",
                        marginTop: 4,
                        background: "none",
                        border: "none",
                        color: "var(--text-secondary)",
                        fontSize: "0.85rem",
                        textDecoration: "underline",
                        cursor: "pointer",
                        padding: "6px 0",
                      }}
                    >
                      Something else
                    </button>
                  )}

                  {obstaclePreview && (
                    <motion.div
                      initial={reduceMotion ? false : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: reduceMotion ? 0 : 0.2 }}
                      aria-live="polite"
                      style={{
                        marginTop: 8,
                        padding: 14,
                        borderRadius: "var(--radius-md)",
                        background: "var(--bg-secondary)",
                        border: "1px solid var(--border-color)",
                        fontSize: "0.85rem",
                      }}
                    >
                      <span style={{ color: "var(--text-muted)" }}>So your plan becomes: </span>
                      <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                        {obstaclePreview.approach}
                      </span>
                      <span style={{ color: "var(--text-secondary)" }}> — {obstaclePreview.taskType}.</span>
                    </motion.div>
                  )}
                </div>
              )}

              {/* ---- Error ------------------------------------------------------- */}
              {error && (
                <p
                  id="onboarding-error"
                  role="alert"
                  aria-live="assertive"
                  style={{
                    margin: 0,
                    padding: "12px 16px",
                    borderRadius: "var(--radius-md)",
                    background: "rgba(239,68,68,0.1)",
                    border: "1px solid var(--accent-danger, #ef4444)",
                    color: "var(--text-primary)",
                    fontSize: "0.875rem",
                  }}
                >
                  {error}
                </p>
              )}

              <button
                type="button"
                onClick={() => handleNext()}
                disabled={!canContinue || saving || validatingGoal}
                style={{
                  width: "100%",
                  minHeight: 52,
                  padding: "16px 24px",
                  borderRadius: "var(--radius-md)",
                  border: "none",
                  background: canContinue ? "var(--accent-primary)" : "var(--bg-secondary)",
                  color: canContinue ? "#fff" : "var(--text-muted)",
                  fontSize: "1rem",
                  fontWeight: 600,
                  cursor: canContinue && !saving ? "pointer" : "not-allowed",
                  transition: "background 0.2s ease",
                }}
              >
                {validatingGoal ? "Checking…" : saving ? "Saving…" : "Continue"}
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      </main>

      <style jsx global>{`
        @media (max-width: 520px) {
          .onboarding-steps {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
