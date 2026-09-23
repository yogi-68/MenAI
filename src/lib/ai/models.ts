/**
 * Two-tier model strategy — keeps the large majority of calls on the fast model.
 *
 * Set in env to move tiers without a code change:
 *   OPENAI_FAST_MODEL=gpt-4o-mini
 *   OPENAI_DEEP_MODEL=gpt-4o
 */

/** Chat, extraction, daily plans, reflections, classification */
export const FAST_MODEL = process.env.OPENAI_FAST_MODEL?.trim() || "gpt-4o-mini";

/** Weekly reviews, milestone generation, completion reviews, escalated chat */
export const DEEP_MODEL = process.env.OPENAI_DEEP_MODEL?.trim() || "gpt-4o";

/** Daily planner — runs several times a day, stays cheap */
export const PLANNER_MODEL = FAST_MODEL;

/**
 * Coach chat baseline.
 *
 * This is the *floor*, not the ceiling: `selectModel()` in the router escalates
 * to DEEP_MODEL for crisis and high-intensity turns. Previously the router's
 * decision was overwritten with DEEP_MODEL unconditionally on the following
 * line, which put every single turn on the expensive model.
 */
export const COACH_CHAT_MODEL = FAST_MODEL;

/** Escalation target for turns that genuinely need depth. */
export const COACH_DEEP_MODEL = DEEP_MODEL;

/** Memory / identity synthesis — scheduled jobs only */
export const SYNTHESIS_MODEL = DEEP_MODEL;

/** Embeddings. Centralized here so cost accounting can see it. */
export const EMBEDDING_MODEL = "text-embedding-3-small";

/** Moderation endpoint model. */
export const MODERATION_MODEL = "omni-moderation-latest";

export function isDeepModel(model: string): boolean {
  return model === DEEP_MODEL;
}

/**
 * USD per 1M tokens, by model.
 *
 * Cost was previously estimated at a flat mini rate regardless of which model
 * actually ran, understating real spend by an order of magnitude whenever the
 * deep model was used. Unknown models fall back to the deep rate so that a
 * mistake over-reports rather than under-reports.
 */
const PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-5-mini": { input: 0.25, output: 2 },
  "gpt-5": { input: 1.25, output: 10 },
  "text-embedding-3-small": { input: 0.02, output: 0 },
};

const FALLBACK_PRICING = { input: 2.5, output: 10 };

/** Estimated USD cost for a single call. */
export function estimateCostUsd(model: string, tokensIn: number, tokensOut: number): number {
  const rate = PRICING[model] ?? FALLBACK_PRICING;
  return (tokensIn / 1_000_000) * rate.input + (tokensOut / 1_000_000) * rate.output;
}

/** True when we have real pricing rather than the conservative fallback. */
export function hasKnownPricing(model: string): boolean {
  return model in PRICING;
}
