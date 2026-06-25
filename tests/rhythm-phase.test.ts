import { describe, expect, it } from "vitest";
import {
  getCurrentPhase,
  getExecutionUrgency,
  buildRhythmContext,
} from "@/lib/plans/rhythm-phase";

describe("rhythm-phase", () => {
  it("returns morning before noon", () => {
    expect(getCurrentPhase(9)).toBe("morning");
  });

  it("escalates urgency when behind in afternoon", () => {
    const urgency = getExecutionUrgency({
      hour: 15,
      tasksCompletedToday: 0,
      tasksDueToday: 9,
      daysToNearestMilestone: 5,
    });
    expect(urgency).toBe("urgent");
  });

  it("builds rhythm context with tone instruction", () => {
    const ctx = buildRhythmContext({
      hour: 10,
      tasksCompletedToday: 3,
      tasksDueToday: 9,
    });
    expect(ctx.phase).toBe("morning");
    expect(ctx.toneInstruction.length).toBeGreaterThan(10);
  });
});
