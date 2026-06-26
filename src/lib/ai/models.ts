/**
 * Two-tier model strategy — keeps ~90–95% of calls on the fast model.
 *
 * Set in env when GPT-5 family is available:
 *   OPENAI_FAST_MODEL=gpt-5-mini
 *   OPENAI_DEEP_MODEL=gpt-5
 */

/** Chat, extraction, daily plans, reflections, classification */
export const FAST_MODEL =
  process.env.OPENAI_FAST_MODEL?.trim() || "gpt-4o-mini";

/** Weekly reviews, milestone gen, completion reviews, coach chat */
export const DEEP_MODEL =
  process.env.OPENAI_DEEP_MODEL?.trim() || "gpt-4o";

/** Daily planner — fast and cheap (runs multiple times per day) */
export const PLANNER_MODEL = FAST_MODEL;

/** Coach chat — high-value interaction */
export const COACH_CHAT_MODEL = DEEP_MODEL;

/** Memory / identity synthesis — scheduled jobs only */
export const SYNTHESIS_MODEL = DEEP_MODEL;

export function isDeepModel(model: string): boolean {
  return model === DEEP_MODEL;
}
