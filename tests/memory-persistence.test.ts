import { describe, expect, it } from "vitest";
import { statusFromInfluence, computeInfluenceScore } from "@/lib/mentor/memory-lifecycle";

describe("permanent memory persistence", () => {
  it("keeps permanent memories active regardless of age", () => {
    const influence = computeInfluenceScore({
      confidence: 0.9,
      mentionCount: 1,
      lastMentionedAt: new Date(Date.now() - 200 * 86400000).toISOString(),
      memoryType: "thought",
      isPermanent: true,
    });

    expect(influence).toBeGreaterThanOrEqual(0.55);
    expect(statusFromInfluence(influence, 200, "thought", true)).toBe("active");
  });
});
