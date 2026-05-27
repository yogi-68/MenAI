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
    return <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
      <p className="text-white">Loading...</p>
    </div>;
  }

  const promptToShow = askingFollowUp ? currentQuestion.otherPrompt : currentQuestion.prompt;

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col">
      {/* Progress Bar */}
      <div className="w-full h-1 bg-gray-800">
        <div
          className="h-full bg-blue-500 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-2xl w-full">
          {/* Question Number */}
          <div className="text-gray-500 text-sm mb-2">
            Question {questionNumber} of {totalQuestions}
          </div>

          {/* Question Prompt */}
          <h1 className="text-3xl font-bold mb-8 text-white">
            {promptToShow}
          </h1>

          {/* Question Input */}
          <div className="mb-8">
            {currentQuestion.type === "text" && (
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500 text-white"
                placeholder="Type your answer..."
                autoFocus
              />
            )}

            {currentQuestion.type === "textarea" && (
              <textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500 text-white min-h-[120px]"
                placeholder="Share your thoughts..."
                autoFocus
              />
            )}

            {(currentQuestion.type === "multiple_choice" ||
              currentQuestion.type === "forced_choice") &&
              !askingFollowUp && (
                <div className="space-y-3">
                  {currentQuestion.options?.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => handleOptionToggle(option.value)}
                      className={`w-full px-6 py-4 rounded-lg border-2 transition-all text-left ${
                        selectedOptions.includes(option.value)
                          ? "border-blue-500 bg-blue-500/10"
                          : "border-gray-700 bg-gray-900 hover:border-gray-600"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}

                  {currentQuestion.allowOther && (
                    <button
                      onClick={() => setShowOther(!showOther)}
                      className={`w-full px-6 py-4 rounded-lg border-2 transition-all text-left ${
                        showOther
                          ? "border-blue-500 bg-blue-500/10"
                          : "border-gray-700 bg-gray-900 hover:border-gray-600"
                      }`}
                    >
                      Other
                    </button>
                  )}

                  {showOther && !askingFollowUp && (
                    <input
                      type="text"
                      value={otherText}
                      onChange={(e) => setOtherText(e.target.value)}
                      className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500 text-white mt-2"
                      placeholder="Please specify..."
                      autoFocus
                    />
                  )}
                </div>
              )}

            {currentQuestion.type === "slider" && (
              <div className="space-y-4">
                <input
                  type="range"
                  min={currentQuestion.min}
                  max={currentQuestion.max}
                  value={sliderValue}
                  onChange={(e) => setSliderValue(parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                />
                <div className="flex justify-between text-sm text-gray-400">
                  <span>{currentQuestion.labels?.min}</span>
                  <span className="text-white font-semibold text-lg">
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
                className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500 text-white min-h-[120px]"
                placeholder="Tell me more..."
                autoFocus
              />
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-4">
            <button
              onClick={handleNext}
              disabled={saving}
              className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
            >
              {saving ? "Saving..." : questionNumber === totalQuestions ? "Complete" : "Next"}
            </button>

            {currentQuestion.optional && !askingFollowUp && (
              <button
                onClick={handleSkip}
                disabled={saving}
                className="px-6 py-3 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-900 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
              >
                Skip
              </button>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
        }
        .slider::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
          border: none;
        }
      `}</style>
    </div>
  );
}
