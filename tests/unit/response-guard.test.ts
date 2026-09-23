import { describe, it, expect } from "vitest";
import { createResponseGuard, validateResponse } from "@/lib/ai/orchestrator/response-validator";

/**
 * The invariant: what the guard emits is exactly what gets stored.
 *
 * Validation used to run after the whole response had streamed, so trimming
 * applied only to the database copy — a user read one answer and saw a shorter
 * one after reloading.
 */
const ctx = { crisisMode: false, emotionIntensity: 3 };

function streamThrough(guard: ReturnType<typeof createResponseGuard>, chunks: string[]) {
  let emitted = "";
  for (const chunk of chunks) {
    const out = guard.push(chunk);
    emitted += out.emit;
    if (out.done) break;
  }
  return emitted;
}

describe("createResponseGuard", () => {
  it("emits exactly what it stores", () => {
    const guard = createResponseGuard(ctx);
    const emitted = streamThrough(guard, ["Hello. ", "That's a good ", "start."]);
    expect(guard.finish().content).toBe(emitted);
  });

  it("stops at the length limit instead of trimming after the fact", () => {
    const guard = createResponseGuard(ctx);
    const long = Array.from({ length: 30 }, (_, i) => `Sentence number ${i}.`);
    const emitted = streamThrough(
      guard,
      long.map((s) => s + " ")
    );
    const result = guard.finish();

    expect(result.content).toBe(emitted);
    expect(result.flags).toContain("response_trimmed");
    expect(result.content.split(/(?<=[.!?])\s+/).filter(Boolean).length).toBeLessThanOrEqual(8);
  });

  it("halts the stream on a prohibited medical claim", () => {
    const guard = createResponseGuard(ctx);
    const emitted = streamThrough(guard, [
      "Looking at this, ",
      "you have depression and should ",
      "definitely take 50mg of something.",
    ]);
    const result = guard.finish();

    expect(result.flags).toContain("diagnosis_language");
    expect(result.content).toBe(emitted);
    // The tail after the violation must never reach the user or the database.
    expect(result.content).not.toContain("50mg");
  });

  it("halts on an impersonation claim", () => {
    const guard = createResponseGuard(ctx);
    streamThrough(guard, ["As a therapist, I'd say you need more rest."]);
    expect(guard.finish().flags).toContain("human_claim");
  });

  it("applies the tighter crisis limits", () => {
    const guard = createResponseGuard({ crisisMode: true, emotionIntensity: 9 });
    streamThrough(
      guard,
      Array.from({ length: 12 }, (_, i) => `Short line ${i}. `)
    );
    const result = guard.finish();
    expect(result.content.split(/(?<=[.!?])\s+/).filter(Boolean).length).toBeLessThanOrEqual(4);
  });

  it("replaces an empty response", () => {
    const guard = createResponseGuard(ctx);
    const result = guard.finish();
    expect(result.flags).toContain("empty_response_replaced");
    expect(result.content.length).toBeGreaterThan(0);
  });

  it("leaves an ordinary response untouched", () => {
    const guard = createResponseGuard(ctx);
    const text = "That's worth unpacking. What happened right before you stopped?";
    const emitted = streamThrough(guard, [text]);
    const result = guard.finish();
    expect(emitted).toBe(text);
    expect(result.modified).toBe(false);
    expect(result.content).toBe(text);
  });
});

describe("validateResponse", () => {
  it("matches the guard for a complete string", () => {
    const text = "One thing at a time. What's the smallest next step?";
    expect(validateResponse(text, ctx).content).toBe(text);
  });
});
