import { describe, it, expect } from "vitest";
import {
  normalizePattern,
  isExecutionPattern,
  type ExecutionPattern,
} from "@/lib/patterns/vocabulary";
import { patternGuidanceFor } from "@/lib/plans/pattern-task-guidance";
import { asFrequency, asSeverity } from "@/lib/patterns/record";
import { ALLOWED_EXECUTION_PATTERNS } from "@/lib/product/constants";

/**
 * The bug these exist to prevent.
 *
 * `execution_patterns.pattern` carries a CHECK constraint listing seven
 * values. The keyword detector emitted an eighth, `reactive_schedule`, and the
 * confidence Q&A wrote the user's free text. Both produced inserts that failed
 * the constraint — silently, because neither result was checked. The regex
 * that emitted the eighth value matches ordinary talk about meetings, so it
 * was not a rare path.
 *
 * Everything that writes a pattern now goes through normalizePattern, so the
 * single invariant worth locking down is: it never returns something the
 * database would reject.
 */

/** Mirrors the CHECK constraint in migrations 003 and 010. */
const DATABASE_CHECK_VALUES = [
  "overthinking",
  "procrastination",
  "avoidance",
  "perfectionism",
  "scattered_focus",
  "inconsistency",
  "burnout",
] as const;

describe("the vocabulary matches the database", () => {
  it("has exactly the values the CHECK constraint allows", () => {
    expect([...ALLOWED_EXECUTION_PATTERNS].sort()).toEqual([...DATABASE_CHECK_VALUES].sort());
  });

  it("has task guidance for every pattern", () => {
    // The guidance map is keyed by ExecutionPattern, so a gap is normally a
    // compile error. This covers the runtime side of the same guarantee.
    for (const pattern of ALLOWED_EXECUTION_PATTERNS) {
      const guidance = patternGuidanceFor(pattern);
      expect(guidance, pattern).toBeDefined();
      expect(guidance!.preferTasks.length, pattern).toBeGreaterThan(0);
      expect(guidance!.coachNote, pattern).toBeTruthy();
    }
  });
});

describe("normalizePattern never produces an invalid value", () => {
  const inputs = [
    // The value that was actually being written and failing.
    "reactive_schedule",
    // Onboarding option values.
    "scattered_focus_priorities",
    "lack_of_time",
    "fear_of_failure",
    "low_energy",
    "meetings",
    "context_switching",
    "poor_sleep",
    "long_hours",
    "admin",
    "ambiguity",
    "conflict",
    // Free text a user might type into the confidence question.
    "I keep overthinking every decision",
    "user acquisition is hard",
    "I put everything off until the last minute",
    "running on empty lately",
    "too many things at once",
    "I never think it's good enough",
    "start strong then stop after a week",
    // Adversarial.
    "",
    "   ",
    "DROP TABLE execution_patterns",
    "Procrastination",
    "SCATTERED FOCUS",
    "scattered-focus",
  ];

  for (const input of inputs) {
    it(`handles ${JSON.stringify(input.slice(0, 40))}`, () => {
      const result = normalizePattern(input);
      // Either a value the database accepts, or an explicit refusal.
      if (result !== null) {
        expect(DATABASE_CHECK_VALUES, input).toContain(result);
      }
    });
  }

  it("accepts null and undefined without throwing", () => {
    expect(normalizePattern(null)).toBeNull();
    expect(normalizePattern(undefined)).toBeNull();
  });

  it("maps the value that used to break inserts", () => {
    expect(normalizePattern("reactive_schedule")).toBe("scattered_focus");
  });

  it("is case and separator insensitive", () => {
    expect(normalizePattern("Procrastination")).toBe("procrastination");
    expect(normalizePattern("scattered-focus")).toBe("scattered_focus");
    expect(normalizePattern("SCATTERED FOCUS")).toBe("scattered_focus");
  });

  it("refuses rather than guessing when there is no match", () => {
    // A wrong pattern is worse than none: the planner acts on this value.
    expect(normalizePattern("user acquisition is hard")).toBeNull();
    expect(normalizePattern("DROP TABLE execution_patterns")).toBeNull();
  });

  it("round-trips every allowed value unchanged", () => {
    for (const pattern of ALLOWED_EXECUTION_PATTERNS) {
      expect(normalizePattern(pattern)).toBe(pattern);
    }
  });

  it("reads free text describing each pattern", () => {
    const cases: Array<[string, ExecutionPattern]> = [
      ["I keep overthinking every decision", "overthinking"],
      ["I put everything off until the last minute", "procrastination"],
      ["running on empty lately", "burnout"],
      ["too many things at once", "scattered_focus"],
      ["I never think it's good enough", "perfectionism"],
      ["start strong then stop after a week", "inconsistency"],
    ];
    for (const [text, expected] of cases) {
      expect(normalizePattern(text), text).toBe(expected);
    }
  });
});

describe("isExecutionPattern", () => {
  it("accepts only the allowed values", () => {
    expect(isExecutionPattern("burnout")).toBe(true);
    expect(isExecutionPattern("reactive_schedule")).toBe(false);
    expect(isExecutionPattern("")).toBe(false);
  });
});

describe("narrowing model output", () => {
  it("keeps valid frequencies and drops invented ones", () => {
    expect(asFrequency("frequent")).toBe("frequent");
    expect(asFrequency("constant")).toBe("constant");
    // An LLM answering in prose would previously have failed the insert.
    expect(asFrequency("very often")).toBeUndefined();
    expect(asFrequency(null)).toBeUndefined();
    expect(asFrequency(3)).toBeUndefined();
  });

  it("keeps valid severities and drops invented ones", () => {
    expect(asSeverity("high")).toBe("high");
    expect(asSeverity("critical")).toBeUndefined();
    expect(asSeverity(undefined)).toBeUndefined();
  });
});
