/**
 * Brand — single source of truth for product identity.
 *
 * Every user-visible product name, tagline and boundary statement comes from
 * here. Renaming the product is a one-file change.
 */

export const BRAND = {
  /** Product name. */
  name: "Mettle",

  /** One-line positioning. */
  tagline: "Your mental performance coach",

  /** Longer positioning, for meta descriptions and the landing hero. */
  description:
    "Mettle is a mental performance coach. It learns how your mind actually works — your patterns, your energy, what drains you — and holds you accountable to the work that matters.",

  /** Canonical origin. Falls back to localhost in development. */
  get origin(): string {
    return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000";
  },
} as const;

/**
 * The product boundary, stated verbatim wherever it needs stating.
 *
 * Mettle is explicitly non-clinical. This string appears in the coach's system
 * prompt, the landing page, onboarding, and the crisis response — it must read
 * the same in all of them.
 */
export const NON_CLINICAL_BOUNDARY =
  `${BRAND.name} is a performance coach, not a therapist, and not a substitute for professional care.`;

export type Brand = typeof BRAND;
