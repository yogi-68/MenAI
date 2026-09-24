import { describe, it, expect } from "vitest";
import {
  buildPlanContextSnapshot,
  computeContextDimensions,
  pickNextInterviewDimension,
  questionForDimension,
  type DimensionInput,
} from "@/lib/plans/plan-context-dimensions";

/**
 * The adaptive interview was unreachable: every dimension was marked
 * `interviewable: false`, so marginalGainFor() returned 0 for all of them and
 * pickNextInterviewDimension() could never return a question. These tests
 * exist so that can't silently happen again.
 */

function input(over: Partial<DimensionInput> = {}): DimensionInput {
  return {
    goals: [],
    initiatives: [{ title: "Ship the beta", description: null, target_date: null, life_area: "work" }],
    patterns: [],
    recentCompletedTasks: 0,
    recentReflections: [],
    planContext: {},
    questionsAskedToday: [],
    recentStateCheckins: 0,
    ...over,
  };
}

describe("the interview can actually fire", () => {
  it("asks something when context is empty", () => {
    const snapshot = buildPlanContextSnapshot(input());
    expect(snapshot.shouldInterview).toBe(true);
    expect(pickNextInterviewDimension(input())).not.toBeNull();
  });

  it("produces a question for whatever it picks", () => {
    const dimension = pickNextInterviewDimension(input());
    expect(dimension).not.toBeNull();
    const question = questionForDimension(dimension!.id, { initiativeTitle: "Ship the beta" });
    expect(question.prompt.length).toBeGreaterThan(10);
  });

  it("marks interviewable dimensions with a non-zero marginal gain", () => {
    const withGain = computeContextDimensions(input()).filter((d) => d.marginalGain > 0);
    expect(withGain.length).toBeGreaterThan(0);
  });
});

describe("when it stops", () => {
  it("never asks without a goal to plan around", () => {
    const snapshot = buildPlanContextSnapshot(input({ initiatives: [] }));
    expect(snapshot.shouldInterview).toBe(false);
    expect(snapshot.stopReason).toBe("no_initiatives");
  });

  it("respects the daily cap", () => {
    const snapshot = buildPlanContextSnapshot(
      input({
        questionsAskedToday: ["a", "b", "c", "d", "e"],
      })
    );
    expect(snapshot.shouldInterview).toBe(false);
    expect(snapshot.stopReason).toBe("max_questions");
  });

  it("stops when context is already rich enough", () => {
    const snapshot = buildPlanContextSnapshot(
      input({
        initiatives: [
          {
            title: "Ship the beta to 50 users",
            description: "Public launch",
            target_date: "2026-12-01",
            life_area: "work",
          },
        ],
        recentCompletedTasks: 8,
        recentStateCheckins: 14,
        planContext: {
          weeklyAvailableHours: 12,
          biggestObstacle: "I rewrite onboarding copy instead of shipping",
          initiativeOutcome90d: "50 paying users",
          currentMetric: "12 users today",
          peakEnergyWindow: "Early morning, before 10am",
          depletedBy: "Back-to-back calls after lunch",
          recoveryAction: "A walk without my phone",
        },
      })
    );
    expect(snapshot.shouldInterview).toBe(false);
    expect(snapshot.stopReason).toBeDefined();
  });

  it("never repeats a dimension asked today", () => {
    const first = pickNextInterviewDimension(input());
    expect(first).not.toBeNull();
    const second = pickNextInterviewDimension(input({ questionsAskedToday: [first!.id] }));
    expect(second?.id).not.toBe(first!.id);
  });
});

describe("mental-performance dimensions", () => {
  it("scores them low when nothing is known", () => {
    const dims = computeContextDimensions(input());
    for (const id of ["energy_pattern", "depletion_source", "recovery_style"]) {
      const dim = dims.find((d) => d.id === id);
      expect(dim, id).toBeDefined();
      expect(dim!.satisfied, id).toBe(false);
    }
  });

  it("counts a concrete answer as satisfying the dimension", () => {
    const dims = computeContextDimensions(
      input({
        planContext: { peakEnergyWindow: "Between 6am and 10am, before any meetings" },
      })
    );
    expect(dims.find((d) => d.id === "energy_pattern")!.satisfied).toBe(true);
  });

  it("improves the state baseline as readings accumulate", () => {
    const none = computeContextDimensions(input({ recentStateCheckins: 0 }));
    const some = computeContextDimensions(input({ recentStateCheckins: 8 }));
    const scoreFor = (dims: ReturnType<typeof computeContextDimensions>) =>
      dims.find((d) => d.id === "state_baseline")!.score;
    expect(scoreFor(some)).toBeGreaterThan(scoreFor(none));
  });

  it("does not interview for the state baseline — it is logged, not asked", () => {
    // Nothing known at all, so it is the weakest dimension by a wide margin.
    const picked = pickNextInterviewDimension(input({ recentStateCheckins: 0 }));
    expect(picked?.id).not.toBe("state_baseline");
    expect(picked?.id).not.toBe("recent_activity");
  });
});

describe("weights", () => {
  it("produces an overall score inside 0-100", () => {
    for (const checkins of [0, 5, 20]) {
      const snapshot = buildPlanContextSnapshot(input({ recentStateCheckins: checkins }));
      expect(snapshot.overall).toBeGreaterThanOrEqual(0);
      expect(snapshot.overall).toBeLessThanOrEqual(100);
    }
  });

  it("rates richer context above empty context", () => {
    const empty = buildPlanContextSnapshot(input()).overall;
    const rich = buildPlanContextSnapshot(
      input({
        initiatives: [
          {
            title: "Ship the beta to 50 users",
            description: "Public launch",
            target_date: "2026-12-01",
            life_area: "work",
          },
        ],
        recentCompletedTasks: 6,
        recentStateCheckins: 10,
        planContext: {
          weeklyAvailableHours: 12,
          biggestObstacle: "I keep rewriting the onboarding copy instead of shipping",
          initiativeOutcome90d: "50 paying users",
          peakEnergyWindow: "Early morning, before 10am",
          depletedBy: "Back-to-back calls after lunch",
          recoveryAction: "A walk without my phone",
        },
      })
    ).overall;

    expect(rich).toBeGreaterThan(empty);
  });
});
