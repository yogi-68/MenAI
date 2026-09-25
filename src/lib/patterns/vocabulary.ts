/**
 * The execution-pattern vocabulary — one definition, used everywhere.
 *
 * This list is constrained at three levels that must agree: a CHECK constraint
 * on `execution_patterns.pattern`, the `ALLOWED_EXECUTION_PATTERNS` constant,
 * and whatever the detectors emit. They did not agree.
 *
 * The keyword detector in weakness-engine emitted `reactive_schedule`, which
 * is not in the CHECK constraint, so every message matching its regex produced
 * an insert that failed — silently, because the result was never checked. The
 * regex matches ordinary talk about meetings and back-to-back calls, so this
 * was not a rare path.
 *
 * Everything that writes a pattern now goes through `normalizePattern()`,
 * which either returns a value the database will accept or returns null.
 */

import { ALLOWED_EXECUTION_PATTERNS } from "@/lib/product/constants";

export type ExecutionPattern = (typeof ALLOWED_EXECUTION_PATTERNS)[number];

const ALLOWED = new Set<string>(ALLOWED_EXECUTION_PATTERNS);

export function isExecutionPattern(value: string): value is ExecutionPattern {
  return ALLOWED.has(value);
}

/**
 * Names that detectors, onboarding options and older rows use for a pattern
 * that the vocabulary already covers under a different name.
 *
 * `reactive_schedule` maps to `scattered_focus`: a calendar owned by other
 * people is a specific cause of the same effect, and the planner's guidance
 * for the two would be identical. Where a synonym would flatten a real
 * distinction, it is not listed here — it is left unmapped and rejected, so
 * the gap surfaces rather than being silently folded into a near neighbour.
 */
const SYNONYMS: Record<string, ExecutionPattern> = {
  reactive_schedule: "scattered_focus",
  scattered_focus_priorities: "scattered_focus",
  lack_of_time: "scattered_focus",
  context_switching: "scattered_focus",
  too_many_priorities: "scattered_focus",

  fear_of_failure: "avoidance",
  ambiguity: "avoidance",
  conflict: "avoidance",

  low_energy: "burnout",
  exhaustion: "burnout",
  poor_sleep: "burnout",
  long_hours: "burnout",
  meetings: "burnout",

  admin: "procrastination",
  delay: "procrastination",

  analysis_paralysis: "overthinking",
  rumination: "overthinking",

  perfectionist: "perfectionism",
  inconsistent: "inconsistency",
};

/**
 * Phrases in free text that indicate a pattern.
 *
 * Written to tolerate how people actually phrase these things. English puts
 * words between a verb and its particle or complement — "put *everything*
 * off", "never *think it's* good enough" — so a rule matching only the
 * contiguous phrase misses most real sentences. Each one allows a short gap.
 *
 * Order matters: first match wins, so "avoid" comes last, since it appears
 * inside descriptions of several of the others.
 */
const FREE_TEXT_SIGNALS: Array<{ re: RegExp; pattern: ExecutionPattern }> = [
  { re: /analysis paralysis|overthink|keep researching|second-guess/i, pattern: "overthinking" },
  {
    re: /procrastinat|\bput(ting)?\b[^.!?]{0,24}\boff\b|keep delaying|last minute/i,
    pattern: "procrastination",
  },
  { re: /burn(ed|t)? out|exhaust|no energy|running on empty|depleted/i, pattern: "burnout" },
  {
    // English puts objects between a verb and its complement: "never think
    // it's good enough". Matching only the contiguous phrase misses most
    // real sentences, so allow a short gap.
    re: /perfection|\bnever\b[^.!?]{0,24}good enough|not good enough|keep polishing|keep tweaking/i,
    pattern: "perfectionism",
  },
  {
    re: /scatter|too many (things|priorities)|spread (too )?thin|context.?switch|all over the place/i,
    pattern: "scattered_focus",
  },
  {
    // "start strong then stop after a week" — the gap between the two verbs
    // is where the description lives, so it needs room.
    re: /inconsistent|can'?t stick|keep stopping|\bstart\b[^.!?]{0,24}\bstop\b|fall off/i,
    pattern: "inconsistency",
  },
  { re: /avoid|afraid|scared|fear of|keep dodging/i, pattern: "avoidance" },
];

/**
 * Coerce anything into a pattern the database will accept, or null.
 *
 * Accepts an exact value, a known synonym, or free text. Returns null when
 * there is no confident match — callers must treat that as "do not write"
 * rather than substituting a default, because a wrong pattern is worse than
 * a missing one: the planner changes its behaviour based on this value.
 */
export function normalizePattern(input: string | null | undefined): ExecutionPattern | null {
  if (!input) return null;

  const cleaned = input.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!cleaned) return null;

  if (isExecutionPattern(cleaned)) return cleaned;
  if (cleaned in SYNONYMS) return SYNONYMS[cleaned];

  for (const { re, pattern } of FREE_TEXT_SIGNALS) {
    if (re.test(input)) return pattern;
  }

  return null;
}

/**
 * Planning guidance for each pattern lives in
 * `@/lib/plans/pattern-task-guidance`, keyed by `ExecutionPattern` so the
 * compiler catches a pattern added here without guidance to match.
 */

