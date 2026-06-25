import { describe, expect, it } from "vitest";

const TASKS_PER_GOAL = 3;

function enforceThreeTasksPerGoal(
  tasks: Array<{ title: string; linkedInitiative?: string }>,
  goalTitles: string[]
) {
  const byGoal = new Map<string, typeof tasks>();
  const unlinked: typeof tasks = [];

  for (const t of tasks) {
    const key = t.linkedInitiative?.trim().toLowerCase() || "";
    const matched = goalTitles.find((g) => g.toLowerCase() === key);
    if (matched) {
      const list = byGoal.get(matched.toLowerCase()) || [];
      list.push(t);
      byGoal.set(matched.toLowerCase(), list);
    } else {
      unlinked.push(t);
    }
  }

  const result: typeof tasks = [];
  for (const title of goalTitles) {
    const key = title.toLowerCase();
    let list = byGoal.get(key) || [];
    while (list.length < TASKS_PER_GOAL && unlinked.length > 0) {
      const next = unlinked.shift()!;
      list.push({ ...next, linkedInitiative: title });
    }
    result.push(...list.slice(0, TASKS_PER_GOAL));
  }
  return result;
}

describe("daily planner 3 tasks per goal", () => {
  it("assigns exactly 3 tasks per goal", () => {
    const goals = ["Build SaaS", "Fitness"];
    const tasks = [
      { title: "Landing page", linkedInitiative: "Build SaaS" },
      { title: "Auth flow", linkedInitiative: "Build SaaS" },
      { title: "Deploy", linkedInitiative: "Build SaaS" },
      { title: "Workout", linkedInitiative: "Fitness" },
      { title: "Walk", linkedInitiative: "Fitness" },
      { title: "Meal prep", linkedInitiative: "Fitness" },
    ];
    const result = enforceThreeTasksPerGoal(tasks, goals);
    expect(result).toHaveLength(6);
    expect(result.filter((t) => t.linkedInitiative === "Build SaaS")).toHaveLength(3);
    expect(result.filter((t) => t.linkedInitiative === "Fitness")).toHaveLength(3);
  });

  it("redistributes unlinked tasks to goals", () => {
    const goals = ["Build SaaS"];
    const tasks = [
      { title: "Extra task" },
      { title: "Landing", linkedInitiative: "Build SaaS" },
    ];
    const result = enforceThreeTasksPerGoal(tasks, goals);
    expect(result.length).toBeLessThanOrEqual(3);
    expect(result.every((t) => t.linkedInitiative === "Build SaaS")).toBe(true);
  });
});
