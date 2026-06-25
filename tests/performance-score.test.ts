import { describe, expect, it } from "vitest";
import { scoreFromCompletion, TASKS_PER_GOAL } from "@/lib/plans/performance-score";

describe("performance score", () => {
  it("scores 100 when all 3 tasks completed", () => {
    expect(scoreFromCompletion(3)).toBe(100);
  });

  it("scores 66 when 2 of 3 tasks completed", () => {
    expect(scoreFromCompletion(2)).toBe(67);
  });

  it("scores 33 when 1 of 3 tasks completed", () => {
    expect(scoreFromCompletion(1)).toBe(33);
  });

  it("scores 0 when none completed", () => {
    expect(scoreFromCompletion(0)).toBe(0);
  });

  it("uses 3 tasks per goal constant", () => {
    expect(TASKS_PER_GOAL).toBe(3);
  });
});
