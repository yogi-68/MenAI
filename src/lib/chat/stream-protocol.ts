/**
 * The chat streaming wire protocol, defined once for both ends.
 *
 * The response body is plain text: the assistant's reply, streamed as it is
 * produced, followed by a single trailer line carrying data that isn't known
 * until the reply is finished — the server-assigned message id, and an
 * optional follow-up question.
 *
 *     ...reply text...\n__DONE__:{"id":"<uuid>","cq":null}\n
 *
 * The trailer is parsed by `createStreamParser`, which buffers across reads.
 * The previous client searched for the trailer inside a single decoded chunk,
 * so whenever it straddled a network read boundary — which is a function of
 * packet timing, not of anything the code controls — the raw JSON was appended
 * to the message and rendered to the user as text.
 */

export const STREAM_TRAILER_PREFIX = "\n__DONE__:";
const TRAILER_SUFFIX = "\n";

export interface StreamTrailer {
  /** Server-assigned id for the persisted assistant message. */
  id: string | null;
  /** A follow-up question to render, when the coach has one to ask. */
  cq: { factor: string; goalId: string; goalTitle: string } | null;
}

export function encodeStreamTrailer(trailer: StreamTrailer): string {
  return `${STREAM_TRAILER_PREFIX}${JSON.stringify(trailer)}${TRAILER_SUFFIX}`;
}

/**
 * Incremental parser for the response body.
 *
 * Feed it each decoded chunk; it returns the text that is safe to display and
 * captures the trailer once it has arrived in full. It withholds any tail that
 * could still turn out to be the start of the trailer, so a partial marker is
 * never shown to the user.
 */
export function createStreamParser() {
  let pending = "";
  let trailer: StreamTrailer | null = null;
  let finished = false;

  /** Length of the longest suffix of `text` that prefixes `marker`. */
  function partialMarkerLength(text: string, marker: string): number {
    const max = Math.min(text.length, marker.length - 1);
    for (let len = max; len > 0; len--) {
      if (text.endsWith(marker.slice(0, len))) return len;
    }
    return 0;
  }

  return {
    /** Returns display text from this chunk; may be empty while buffering. */
    push(chunk: string): string {
      if (finished) return "";
      pending += chunk;

      const markerAt = pending.indexOf(STREAM_TRAILER_PREFIX);

      if (markerAt === -1) {
        // Hold back anything that might be the beginning of the marker.
        const held = partialMarkerLength(pending, STREAM_TRAILER_PREFIX);
        const emit = pending.slice(0, pending.length - held);
        pending = pending.slice(pending.length - held);
        return emit;
      }

      const body = pending.slice(0, markerAt);
      const afterMarker = pending.slice(markerAt + STREAM_TRAILER_PREFIX.length);
      const endAt = afterMarker.indexOf(TRAILER_SUFFIX);

      // Trailer not complete yet — emit the body and keep waiting.
      if (endAt === -1) {
        pending = pending.slice(markerAt);
        return body;
      }

      try {
        const parsed = JSON.parse(afterMarker.slice(0, endAt)) as Partial<StreamTrailer>;
        trailer = { id: parsed.id ?? null, cq: parsed.cq ?? null };
      } catch {
        // A malformed trailer costs us the message id, which the caller
        // handles by falling back to a local id. It must never be rendered.
        trailer = { id: null, cq: null };
      }

      finished = true;
      pending = "";
      return body;
    },

    /** Any text still buffered when the stream ends. */
    flush(): string {
      if (finished) return "";
      const rest = pending;
      pending = "";
      // A lone partial marker at end-of-stream is protocol noise, not content.
      return rest.startsWith(STREAM_TRAILER_PREFIX.slice(0, rest.length)) ? "" : rest;
    },

    get trailer(): StreamTrailer | null {
      return trailer;
    },
  };
}
