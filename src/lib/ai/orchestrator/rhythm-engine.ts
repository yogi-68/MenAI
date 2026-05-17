/**
 * Rhythm Engine — Adaptive Response Pacing
 * 
 * This engine controls the TIMING and RHYTHM of responses,
 * not just the content. Emotional state determines pacing.
 * 
 * Why this matters:
 * - Anxiety → slower pacing creates calm
 * - Reflection → thoughtful pauses feel natural
 * - Crisis → immediate responses feel stabilizing
 * - Normal → standard flow feels conversational
 */

import type { EmotionAnalysis, ConversationState } from "./types";

export type RhythmMode =
  | "immediate"      // Crisis - no delay
  | "grounding"      // Slower, calmer chunks for anxiety
  | "thoughtful"     // Slightly slower for reflection
  | "conversational" // Normal pacing
  | "energetic";     // Faster for positive/excited states

export interface RhythmConfig {
  mode: RhythmMode;
  chunkDelayMs: number;      // Delay between word chunks
  pauseAfterSentence: number; // Extra pause after sentences
  description: string;
}

/**
 * Determine the appropriate rhythm based on emotional state
 */
export function determineRhythm(
  emotion: EmotionAnalysis,
  state: ConversationState
): RhythmConfig {
  // CRISIS: Immediate, no artificial delays
  if (state === "ESCALATION") {
    return {
      mode: "immediate",
      chunkDelayMs: 0,
      pauseAfterSentence: 0,
      description: "Immediate grounding response",
    };
  }

  // HIGH ANXIETY: Slow, calming rhythm
  if (state === "GROUNDING" || (emotion.intensity >= 7 && emotion.sentiment === "negative")) {
    return {
      mode: "grounding",
      chunkDelayMs: 50,  // 50ms delay creates calmer feeling
      pauseAfterSentence: 150,
      description: "Slower, calming pace to help regulate anxiety",
    };
  }

  // EMOTIONAL HOLDING: Medium-slow, warm rhythm
  if (state === "EMOTIONAL_HOLDING") {
    return {
      mode: "thoughtful",
      chunkDelayMs: 40,
      pauseAfterSentence: 120,
      description: "Gentle, unhurried presence",
    };
  }

  // REFLECTION: Thoughtful, contemplative rhythm
  if (state === "REFLECTION" || state === "EXPLORING") {
    return {
      mode: "thoughtful",
      chunkDelayMs: 35,
      pauseAfterSentence: 100,
      description: "Thoughtful, reflective pacing",
    };
  }

  // POSITIVE EMOTION: Slightly faster, more energetic
  if (emotion.sentiment === "positive" && emotion.intensity >= 6) {
    return {
      mode: "energetic",
      chunkDelayMs: 15,
      pauseAfterSentence: 40,
      description: "Uplifting, warm energy",
    };
  }

  // DEFAULT: Natural conversational rhythm
  return {
    mode: "conversational",
    chunkDelayMs: 25,
    pauseAfterSentence: 70,
    description: "Natural conversational flow",
  };
}

/**
 * Apply rhythm to a streaming response
 * Wraps a ReadableStream and adds emotional pacing
 */
export async function applyRhythm(
  stream: ReadableStream<Uint8Array>,
  rhythmConfig: RhythmConfig
): Promise<ReadableStream<Uint8Array>> {
  // If immediate mode, return stream unchanged
  if (rhythmConfig.mode === "immediate") {
    return stream;
  }

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lastWasSentenceEnd = false;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value, { stream: true });
          buffer += text;

          // Process buffer word by word with rhythm
          const words = buffer.split(/(\s+)/); // Keep whitespace
          buffer = words.pop() || ""; // Keep incomplete word in buffer

          for (const word of words) {
            // Check if this ends a sentence
            const isSentenceEnd = /[.!?]\s*$/.test(word);

            // Add delay before outputting chunk
            if (rhythmConfig.chunkDelayMs > 0) {
              await sleep(rhythmConfig.chunkDelayMs);
            }

            // Extra pause after sentence endings (creates breathing room)
            if (lastWasSentenceEnd && rhythmConfig.pauseAfterSentence > 0) {
              await sleep(rhythmConfig.pauseAfterSentence);
            }

            controller.enqueue(encoder.encode(word));
            lastWasSentenceEnd = isSentenceEnd;
          }
        }

        // Flush remaining buffer
        if (buffer.length > 0) {
          if (rhythmConfig.chunkDelayMs > 0) {
            await sleep(rhythmConfig.chunkDelayMs);
          }
          controller.enqueue(encoder.encode(buffer));
        }

        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

/**
 * Sleep utility for rhythm delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get rhythm description for debugging/logging
 */
export function getRhythmDescription(config: RhythmConfig): string {
  return `Rhythm: ${config.mode} (chunk: ${config.chunkDelayMs}ms, sentence: ${config.pauseAfterSentence}ms) - ${config.description}`;
}
