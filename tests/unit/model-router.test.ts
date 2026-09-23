import { describe, it, expect } from "vitest";
import { selectModel } from "@/lib/ai/orchestrator/router";
import { FAST_MODEL, DEEP_MODEL } from "@/lib/ai/models";
import type { EmotionAnalysis, SafetyResult, ConversationState } from "@/lib/ai/orchestrator/types";

const emotion = (over: Partial<EmotionAnalysis> = {}): EmotionAnalysis =>
  ({
    primaryEmotion: "neutral",
    intensity: 3,
    sentiment: "neutral",
    needsSupport: false,
    ...over,
  }) as EmotionAnalysis;

const safety = (over: Partial<SafetyResult> = {}): SafetyResult =>
  ({
    level: "safe",
    categories: [],
    confidence: 0,
    requiresEscalation: false,
    moderationFlagged: false,
    resources: [],
    ...over,
  }) as SafetyResult;

const pick = (
  state: ConversationState,
  e: EmotionAnalysis = emotion(),
  s: SafetyResult = safety()
) => selectModel({ emotion: e, safety: s, state, messageLength: 40 });

describe("selectModel", () => {
  it("keeps an ordinary turn on the fast model", () => {
    expect(pick("LISTENING").model).toBe(FAST_MODEL);
  });

  it("escalates to the deep model for a crisis", () => {
    expect(pick("LISTENING", emotion(), safety({ level: "critical" })).model).toBe(DEEP_MODEL);
    expect(pick("LISTENING", emotion(), safety({ level: "danger" })).model).toBe(DEEP_MODEL);
  });

  it("escalates for high emotional intensity", () => {
    expect(pick("LISTENING", emotion({ intensity: 9, sentiment: "negative" })).model).toBe(
      DEEP_MODEL
    );
  });

  it("escalates for states that need depth", () => {
    for (const state of ["FOUNDER_COACHING", "STRATEGIC_THINKING", "WISDOM_FIRST"] as const) {
      expect(pick(state).model, state).toBe(DEEP_MODEL);
    }
  });

  it("returns a fresh object each time", () => {
    // The shared tier objects were being mutated by the caller, which
    // permanently rewrote the tier for every later request in the process.
    const first = pick("LISTENING");
    first.model = "mutated";
    expect(pick("LISTENING").model).toBe(FAST_MODEL);
  });
});
