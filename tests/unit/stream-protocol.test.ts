import { describe, it, expect } from "vitest";
import {
  createStreamParser,
  encodeStreamTrailer,
  STREAM_TRAILER_PREFIX,
} from "@/lib/chat/stream-protocol";

/**
 * The bug these cover: the previous client searched for the trailer inside a
 * single decoded chunk. Whether it straddled a read boundary depended on
 * packet timing, so raw JSON intermittently rendered as message text.
 */
describe("createStreamParser", () => {
  const trailer = encodeStreamTrailer({ id: "abc-123", cq: null });

  it("returns body text and captures the trailer in one chunk", () => {
    const parser = createStreamParser();
    const out = parser.push("Hello there." + trailer);
    expect(out).toBe("Hello there.");
    expect(parser.trailer).toEqual({ id: "abc-123", cq: null });
  });

  it("captures a trailer split across every possible boundary", () => {
    const full = "Some reply." + trailer;

    for (let split = 1; split < full.length; split++) {
      const parser = createStreamParser();
      let text = parser.push(full.slice(0, split));
      text += parser.push(full.slice(split));
      text += parser.flush();

      expect(text, `split at ${split}`).toBe("Some reply.");
      expect(parser.trailer?.id, `split at ${split}`).toBe("abc-123");
    }
  });

  it("never emits a partial trailer marker as text", () => {
    const parser = createStreamParser();
    const emitted = parser.push("Done." + STREAM_TRAILER_PREFIX.slice(0, 5));
    expect(emitted).toBe("Done.");
  });

  it("carries a confidence question through", () => {
    const cq = { factor: "deadline", goalId: "g1", goalTitle: "Ship beta" };
    const parser = createStreamParser();
    parser.push("Text" + encodeStreamTrailer({ id: "m1", cq }));
    expect(parser.trailer?.cq).toEqual(cq);
  });

  it("drops a malformed trailer rather than rendering it", () => {
    const parser = createStreamParser();
    const out = parser.push("Body" + STREAM_TRAILER_PREFIX + "{not json}\n");
    expect(out).toBe("Body");
    expect(parser.trailer).toEqual({ id: null, cq: null });
  });

  it("emits text unchanged when no trailer ever arrives", () => {
    const parser = createStreamParser();
    const out = parser.push("Just text, no trailer.") + parser.flush();
    expect(out).toBe("Just text, no trailer.");
    expect(parser.trailer).toBeNull();
  });
});
