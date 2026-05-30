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

/** Weekly reviews, milestone gen, completion reviews, rare deep chat */
export const DEEP_MODEL =
  process.env.OPENAI_DEEP_MODEL?.trim() || "gpt-4o";

export function isDeepModel(model: string): boolean {
  return model === DEEP_MODEL;
}
