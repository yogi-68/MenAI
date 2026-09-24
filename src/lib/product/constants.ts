/** Product-wide constants — single source of truth for architecture decisions. */

/** Max concurrent active execution goals (more = noise). */
export const MAX_ACTIVE_GOALS = 3;

/** Max AI touchpoints per day: morning plan, afternoon check, night reflection. */
export const DAILY_AI_TOUCHPOINTS = ["morning", "afternoon", "night"] as const;

/** What Mettle optimizes for (not raw productivity). */
export const PRIMARY_OPTIMIZATION = "consistency" as const;

/** Allowed execution/energy/direction patterns (keep list small). */
export const ALLOWED_EXECUTION_PATTERNS = [
  "procrastination",
  "overthinking",
  "perfectionism",
  "inconsistency",
  "scattered_focus",
  "avoidance",
  "burnout",
] as const;

/** Confidence thresholds for memory writes. */
export const MEMORY_CONFIDENCE = {
  /** Explicit statement in chat → store immediately. */
  explicitSave: 0.75,
  /** Below this → queue as suggestion, do not write to core tables. */
  suggestionOnly: 0.75,
  /** Repeated behavior bumps confidence (future: increment on re-mention). */
  repeatBoost: 0.1,
  /** Patterns need high confidence before persisting. */
  patternMin: 0.7,
  /** Dated opportunities may auto-save when very explicit. */
  opportunityAutoSave: 0.92,
} as const;
