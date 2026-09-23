import { describe, it, expect } from "vitest";
import { estimateCostUsd, hasKnownPricing, FAST_MODEL, COACH_CHAT_MODEL } from "@/lib/ai/models";

/**
 * Cost was previously computed at a flat mini rate whatever model ran,
 * understating deep-model spend by roughly an order of magnitude.
 */
describe("estimateCostUsd", () => {
  it("prices the deep model well above the fast one", () => {
    const fast = estimateCostUsd("gpt-4o-mini", 1_000_000, 1_000_000);
    const deep = estimateCostUsd("gpt-4o", 1_000_000, 1_000_000);
    expect(deep).toBeGreaterThan(fast * 10);
  });

  it("separates input and output rates", () => {
    const inputOnly = estimateCostUsd("gpt-4o", 1_000_000, 0);
    const outputOnly = estimateCostUsd("gpt-4o", 0, 1_000_000);
    expect(outputOnly).toBeGreaterThan(inputOnly);
  });

  it("over-reports rather than under-reports an unknown model", () => {
    const unknown = estimateCostUsd("some-future-model", 1_000_000, 1_000_000);
    const cheap = estimateCostUsd("gpt-4o-mini", 1_000_000, 1_000_000);
    expect(unknown).toBeGreaterThan(cheap);
    expect(hasKnownPricing("some-future-model")).toBe(false);
  });

  it("charges nothing for nothing", () => {
    expect(estimateCostUsd("gpt-4o", 0, 0)).toBe(0);
  });
});

describe("coach model baseline", () => {
  it("starts on the fast tier so the router can escalate", () => {
    // The router used to be overridden with the deep model on every turn.
    expect(COACH_CHAT_MODEL).toBe(FAST_MODEL);
  });
});
