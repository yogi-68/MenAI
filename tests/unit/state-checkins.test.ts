import { describe, it, expect } from "vitest";
import {
  summarizeState,
  formatStateForPrompt,
  currentPhase,
  type StateCheckin,
} from "@/lib/mind/state-checkins";
import { bandForScore, taskLoadForBand } from "@/lib/mind/state-scale";

function checkin(score: number, daysAgo: number, signals: string[] = []): StateCheckin {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  const iso = date.toISOString().split("T")[0];
  return {
    id: `c-${daysAgo}`,
    checkinDate: iso,
    score,
    band: bandForScore(score),
    signals,
    note: null,
    phase: "morning",
    createdAt: `${iso}T09:00:00Z`,
  };
}

describe("bandForScore", () => {
  it("maps the scale onto four bands", () => {
    expect(bandForScore(1)).toBe("depleted");
    expect(bandForScore(3)).toBe("low");
    expect(bandForScore(6)).toBe("steady");
    expect(bandForScore(10)).toBe("strong");
  });
});

describe("taskLoadForBand", () => {
  it("asks less of a depleted day than a strong one", () => {
    expect(taskLoadForBand("depleted")).toBeLessThan(taskLoadForBand("steady"));
    expect(taskLoadForBand("low")).toBeLessThan(taskLoadForBand("strong"));
  });

  it("never asks for nothing", () => {
    expect(taskLoadForBand("depleted")).toBeGreaterThan(0);
  });
});

describe("summarizeState", () => {
  it("falls back to a steady load with no readings", () => {
    const summary = summarizeState([]);
    expect(summary.average).toBeNull();
    expect(summary.trend).toBe("unknown");
    // Behaviour must be unchanged for anyone who has never logged.
    expect(summary.suggestedTaskLoad).toBe(taskLoadForBand("steady"));
  });

  it("refuses to call a trend from fewer than four readings", () => {
    // Three readings falling hard: the shape is obvious, the sample is not.
    const summary = summarizeState([checkin(9, 0), checkin(5, 1), checkin(2, 2)]);
    expect(summary.trend).toBe("unknown");
  });

  it("calls a trend once there is enough to go on", () => {
    const falling = summarizeState([
      checkin(3, 0),
      checkin(3, 1),
      checkin(8, 2),
      checkin(9, 3),
    ]);
    expect(falling.trend).toBe("falling");

    const rising = summarizeState([
      checkin(9, 0),
      checkin(8, 1),
      checkin(3, 2),
      checkin(3, 3),
    ]);
    expect(rising.trend).toBe("rising");
  });

  it("does not mistake normal variation for a trend", () => {
    const summary = summarizeState([
      checkin(6, 0),
      checkin(5, 1),
      checkin(6, 2),
      checkin(5, 3),
    ]);
    expect(summary.trend).toBe("flat");
  });

  it("ranks recurring signals by frequency", () => {
    const summary = summarizeState([
      checkin(4, 0, ["Tired", "Scattered"]),
      checkin(5, 1, ["Tired"]),
      checkin(6, 2, ["Tired", "Anxious"]),
    ]);
    expect(summary.commonSignals[0]).toEqual({ signal: "Tired", count: 3 });
  });

  it("sizes the load from today's reading, not the average", () => {
    // A good fortnight, but today is bad. Today wins.
    const summary = summarizeState([checkin(2, 0), checkin(9, 1), checkin(9, 2), checkin(9, 3)]);
    expect(summary.suggestedTaskLoad).toBe(taskLoadForBand("depleted"));
  });
});

describe("formatStateForPrompt", () => {
  it("says nothing when there is nothing to say", () => {
    expect(formatStateForPrompt(summarizeState([]))).toBe("");
  });

  it("includes today's reading and the recurring signals", () => {
    const block = formatStateForPrompt(
      summarizeState([checkin(3, 0, ["Tired"]), checkin(4, 1, ["Tired"]), checkin(5, 2)])
    );
    expect(block).toContain("3/10");
    expect(block).toContain("tired");
  });
});

describe("currentPhase", () => {
  it("splits the day into four", () => {
    expect(currentPhase(8)).toBe("morning");
    expect(currentPhase(14)).toBe("afternoon");
    expect(currentPhase(19)).toBe("evening");
    expect(currentPhase(23)).toBe("night");
  });
});
