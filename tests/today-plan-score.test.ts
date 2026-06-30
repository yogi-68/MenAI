import { describe, expect, it } from "vitest";
import { todayPlanScorePercent } from "@/lib/plans/today-task-stats";

describe("todayPlanScorePercent", () => {
  it("returns 0 when no tasks due", () => {
    expect(
      todayPlanScorePercent({
        tasksCompletedToday: 0,
        tasksDueToday: 0,
        daysToNearestMilestone: null,
      })
    ).toBe(0);
  });

  it("matches Today's Plan checkbox ratio", () => {
    expect(
      todayPlanScorePercent({
        tasksCompletedToday: 2,
        tasksDueToday: 6,
        daysToNearestMilestone: 12,
      })
    ).toBe(33);
  });

  it("returns 100 when all due tasks completed", () => {
    expect(
      todayPlanScorePercent({
        tasksCompletedToday: 3,
        tasksDueToday: 3,
        daysToNearestMilestone: 5,
      })
    ).toBe(100);
  });
});
