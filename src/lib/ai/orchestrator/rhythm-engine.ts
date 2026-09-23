/**
 * Rhythm Engine — adaptive response pacing.
 *
 * Emotional state can justify a slower delivery: when someone is highly
 * anxious, text arriving in a measured rhythm reads as steadier than text
 * dumped at full speed. That is the idea worth keeping.
 *
 * The previous implementation implemented it as an unconditional additive
 * delay. It split the buffer on /(\s+)/ — which yields roughly two elements
 * per word, the word and the whitespace after it — and slept `chunkDelayMs`
 * on every one of them, plus an extra pause per sentence. At the default
 * "conversational" setting of 25ms that is about 7.5 seconds added to a
 * 150-word reply, and about 15 seconds in "grounding" mode. It applied to
 * every response, because the caller always passes emotion and state.
 *
 * This version paces to a target rate instead of adding to one. It measures
 * how long delivery has actually taken and sleeps only when it is running
 * ahead of the target — so when the model is slow (the common case) it costs
 * nothing at all. A hard budget caps the total it may ever add.
 */

import type { EmotionAnalysis, ConversationState } from "./types";

export type RhythmMode =
  | "immediate" // No pacing — crisis, and the default for ordinary turns.
  | "grounding" // Measured delivery for acute distress.
  | "thoughtful"; // Slightly measured, for reflective turns.

export interface RhythmConfig {
  mode: RhythmMode;
  /** Target delivery rate. 0 means "as fast as the model produces". */
  targetWordsPerMinute: number;
  /** Ceiling on total added latency, in milliseconds. */
  maxAddedLatencyMs: number;
  description: string;
}

/** Enabled per-mode; pacing is off unless the state genuinely calls for it. */
const IMMEDIATE: RhythmConfig = {
  mode: "immediate",
  targetWordsPerMinute: 0,
  maxAddedLatencyMs: 0,
  description: "Full speed",
};

/**
 * Choose a rhythm for this turn.
 *
 * Only two states slow delivery, and both are bounded. Everything else is
 * immediate — including ordinary conversation, which used to be paced.
 */
export function determineRhythm(
  emotion: EmotionAnalysis,
  state: ConversationState
): RhythmConfig {
  if (state === "ESCALATION") return IMMEDIATE;

  // Acute distress: a steady rate reads as calmer than a wall of text.
  // ~320 wpm is still faster than comfortable reading speed, so this only
  // engages when the model is unusually fast.
  if (emotion.intensity >= 7 && emotion.sentiment === "negative") {
    return {
      mode: "grounding",
      targetWordsPerMinute: 320,
      maxAddedLatencyMs: 1500,
      description: "Measured pace to help regulate",
    };
  }

  if (state === "REFLECTION" || state === "EXPLORING") {
    return {
      mode: "thoughtful",
      targetWordsPerMinute: 450,
      maxAddedLatencyMs: 800,
      description: "Slightly measured, reflective",
    };
  }

  return IMMEDIATE;
}

/**
 * Apply rhythm to a streaming response.
 *
 * Passes the stream straight through in immediate mode, so the common path
 * adds no wrapper and no cost.
 */
export async function applyRhythm(
  stream: ReadableStream<Uint8Array>,
  rhythmConfig: RhythmConfig
): Promise<ReadableStream<Uint8Array>> {
  if (rhythmConfig.mode === "immediate" || rhythmConfig.targetWordsPerMinute <= 0) {
    return stream;
  }

  const msPerWord = 60_000 / rhythmConfig.targetWordsPerMinute;
  const reader = stream.getReader();
  const decoder = new TextDecoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const startedAt = Date.now();
      let wordsEmitted = 0;
      let addedLatency = 0;

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value, { stream: true });
          if (!text) continue;

          wordsEmitted += countWords(text);

          // Sleep only for the shortfall against the target schedule, and
          // only while the budget allows.
          if (addedLatency < rhythmConfig.maxAddedLatencyMs) {
            const scheduled = wordsEmitted * msPerWord;
            const elapsed = Date.now() - startedAt;
            const deficit = Math.min(
              scheduled - elapsed,
              rhythmConfig.maxAddedLatencyMs - addedLatency
            );
            if (deficit > 0) {
              addedLatency += deficit;
              await sleep(deficit);
            }
          }

          controller.enqueue(encoder.encode(text));
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      } finally {
        reader.releaseLock();
      }
    },

    cancel(reason) {
      // Propagate cancellation so an abandoned response stops costing tokens.
      return reader.cancel(reason);
    },
  });
}

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
