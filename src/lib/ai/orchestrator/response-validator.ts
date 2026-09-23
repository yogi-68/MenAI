/**
 * Response Validator — output safety and quality checks.
 *
 * Two entry points, for two different situations:
 *
 *   createResponseGuard()  — streaming. Checks text as it arrives and decides
 *                            what may be emitted. Use this on any path where
 *                            the user sees tokens as they are produced.
 *   validateResponse()     — non-streaming. Checks a complete response.
 *
 * Why the guard exists: validation used to run *after* the whole response had
 * already been streamed to the screen. Trimming then applied only to the copy
 * written to the database, so a user read one answer and saw a shorter one
 * after reloading — and the diagnosis / medication / impersonation checks were
 * pure telemetry, since the text they flagged was already on the user's
 * screen. The guard makes the emitted text, the stored text and the validated
 * text the same string by construction.
 */

/** Patterns the coach must never produce. Hard-stop the stream if they appear. */
const PROHIBITED: Array<{ flag: string; pattern: RegExp }> = [
  {
    flag: "diagnosis_language",
    pattern:
      /you (have|suffer from|are diagnosed with) (depression|anxiety|bipolar|ptsd|ocd|adhd|bpd|schizophrenia)|your (diagnosis|condition) is|I('m| am) diagnosing you/i,
  },
  {
    flag: "medication_advice",
    pattern:
      /you should (take|try|start|stop|increase|decrease) (medication|pills|drugs|dosage)|I (recommend|suggest|prescribe) (medication|pills)|take \d+\s*(mg|milligrams)/i,
  },
  {
    flag: "human_claim",
    pattern:
      /I('m| am) a (therapist|doctor|psychologist|psychiatrist|counselor|human)|as a (therapist|doctor|medical professional)/i,
  },
];

/** Shown in place of the remainder when a prohibited pattern is hit mid-stream. */
const STOPPED_NOTICE =
  "\n\nLet me put that differently — that's outside what I can speak to. What's the concrete thing you're trying to move right now?";

const EMPTY_REPLACEMENT =
  "I'm here. Tell me a bit more about what's going on.";

export interface ValidationLimits {
  crisisMode: boolean;
  emotionIntensity: number;
}

function limitsFor(context: ValidationLimits) {
  return {
    maxLength: context.crisisMode ? 400 : 800,
    maxSentences: context.crisisMode ? 4 : 8,
  };
}

/** Count completed sentences in `text`. */
function sentenceCount(text: string): number {
  return text.split(/(?<=[.!?])\s+/).filter(Boolean).length;
}

/** Trim `text` to at most `maxSentences`, closing the final sentence. */
function trimToSentences(text: string, maxSentences: number): string {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length <= maxSentences) return text;
  let out = sentences.slice(0, maxSentences).join(" ").trim();
  if (!/[.!?]$/.test(out)) out += ".";
  return out;
}

export interface GuardChunk {
  /** The text that may be sent to the user. May be shorter than the input. */
  emit: string;
  /** True once nothing further should be streamed. */
  done: boolean;
}

export interface GuardResult {
  /** Exactly the text that was emitted — safe to persist verbatim. */
  content: string;
  modified: boolean;
  flags: string[];
}

/**
 * Stateful guard for a streaming response.
 *
 * Feed every chunk through `push()` and emit only what it returns. When it
 * reports `done`, stop reading the model. `finish()` then yields the exact
 * text the user saw, which is what should be stored.
 */
export function createResponseGuard(context: ValidationLimits) {
  const { maxLength, maxSentences } = limitsFor(context);
  const flags: string[] = [];

  let emitted = "";
  let done = false;
  let modified = false;

  return {
    push(text: string): GuardChunk {
      if (done || !text) return { emit: "", done };

      const candidate = emitted + text;

      // A prohibited claim ends the response. The user may already have seen
      // the start of the sentence; what matters is that the rest never
      // arrives and the unsafe text is never stored.
      for (const { flag, pattern } of PROHIBITED) {
        if (pattern.test(candidate) && !pattern.test(emitted)) {
          flags.push(flag);
          modified = true;
          done = true;
          emitted += STOPPED_NOTICE;
          return { emit: STOPPED_NOTICE, done: true };
        }
      }

      // Length ceiling — enforced here rather than after the fact, so the
      // stored copy cannot diverge from what was displayed.
      //
      // Either limit is sufficient. The original required both, which meant a
      // reply of twelve short sentences sailed past a four-sentence cap: the
      // caps exist to stop the coach rambling, and rambling is not only a
      // character count.
      if (candidate.length > maxLength || sentenceCount(candidate) > maxSentences) {
        const trimmed = trimToSentences(candidate, maxSentences);
        flags.push("response_trimmed");
        modified = true;
        done = true;

        // The trim normalises whitespace between sentences, so it is not
        // guaranteed to extend what we already sent. Text already on the
        // users screen cannot be unsent, so only ever append: if the trim
        // is not a true extension, keep what was emitted and stop there.
        if (trimmed.startsWith(emitted)) {
          const addition = trimmed.slice(emitted.length);
          emitted = trimmed;
          return { emit: addition, done: true };
        }
        return { emit: "", done: true };
      }

      emitted = candidate;
      return { emit: text, done: false };
    },

    finish(): GuardResult {
      let content = emitted;

      if (!content.trim()) {
        content = EMPTY_REPLACEMENT;
        flags.push("empty_response_replaced");
        modified = true;
      }

      if (!context.crisisMode && context.emotionIntensity >= 5 && content.length < 40) {
        flags.push("response_too_short_for_emotion");
      }

      if (context.crisisMode) {
        const dismissive =
          /just (relax|calm down|think positive|cheer up|get over it)|it('s| is) (not that bad|no big deal|nothing)/i;
        if (dismissive.test(content)) flags.push("dismissive_during_crisis");
      }

      return { content, modified, flags };
    },

    /** Text emitted so far. Useful for logging a partial response on error. */
    get text() {
      return emitted;
    },
  };
}

/**
 * Validate a complete, non-streamed response.
 *
 * Equivalent to running the whole string through the guard in one push.
 */
export function validateResponse(response: string, context: ValidationLimits): GuardResult {
  const guard = createResponseGuard(context);
  guard.push(response);
  return guard.finish();
}
