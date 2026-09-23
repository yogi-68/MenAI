/**
 * State resets — short, guided routines the coach can hand a user when their
 * state is blocking the work.
 *
 * Ported from the predecessor mobile app's exercise set and reframed for a
 * performance context. These are self-regulation techniques with ordinary
 * evidence behind them, not treatment: the language talks about capacity and
 * attention, never about symptoms or diagnosis. See NON_CLINICAL_BOUNDARY.
 */

import type { StateBand } from "./state-scale";

export type ResetCategory = "cognitive" | "attention" | "activation" | "perspective";

export interface Reset {
  id: string;
  title: string;
  summary: string;
  category: ResetCategory;
  /** Minutes, honestly estimated. */
  durationMinutes: number;
  /** When this reset is the right tool. Drives coach recommendations. */
  useWhen: string;
  /** Bands this reset suits. */
  bands: readonly StateBand[];
  steps: readonly string[];
}

export const RESETS: readonly Reset[] = [
  {
    id: "reframe",
    title: "Reframe the thought",
    summary: "Test the thought that's stopping you against what you actually know.",
    category: "cognitive",
    durationMinutes: 5,
    useWhen: "A specific belief is blocking you — 'this won't work', 'I'm behind'.",
    bands: ["low", "steady"],
    steps: [
      "Write the thought down exactly as it shows up. Don't soften it.",
      "Name the feeling that comes with it. One word.",
      "Rate how strongly you believe the thought right now, 1 to 10.",
      "What evidence actually supports it? Be specific — events, not impressions.",
      "What evidence cuts against it? Look for exceptions you've been discounting.",
      "Write a version that accounts for both. Not a positive one — a fairer one.",
      "Re-rate your belief in the original thought. Note the number.",
    ],
  },
  {
    id: "ground",
    title: "5-4-3-2-1",
    summary: "Pull attention out of the loop and back into the room.",
    category: "attention",
    durationMinutes: 3,
    useWhen: "You're spiralling, scattered, or can't settle enough to start.",
    bands: ["depleted", "low"],
    steps: [
      "Stop. One slow breath in, one slower out.",
      "Name 5 things you can see.",
      "Name 4 things you can feel against your skin.",
      "Name 3 things you can hear.",
      "Name 2 things you can smell.",
      "Name 1 thing you can taste.",
      "One more breath. Rate your state again — did it move?",
    ],
  },
  {
    id: "smallest-step",
    title: "Smallest possible step",
    summary: "Break paralysis by shrinking the task until it's trivially startable.",
    category: "activation",
    durationMinutes: 5,
    useWhen: "You know what to do and you aren't doing it.",
    bands: ["depleted", "low", "steady"],
    steps: [
      "Name the thing you've been avoiding. Just the one.",
      "Rate how overwhelming it feels, 1 to 10.",
      "What's the smallest step that would count as progress? Aim for under two minutes.",
      "If that still feels heavy, halve it again.",
      "Do it now. Not after this. Now.",
      "Done? Note what it cost you. Not done? Note exactly what stopped you — that's the real data.",
    ],
  },
  {
    id: "zoom-out",
    title: "Zoom out",
    summary: "Re-anchor a bad day against the trend it actually sits in.",
    category: "perspective",
    durationMinutes: 4,
    useWhen: "One setback is colouring everything.",
    bands: ["low", "steady"],
    steps: [
      "What happened? One or two sentences, facts only.",
      "How much of this week does it actually account for?",
      "What went right in the same period that you've stopped counting?",
      "Will this specific thing matter in a month? Answer honestly — sometimes it will.",
      "What's the one thing worth carrying forward from it?",
    ],
  },
] as const;

export function resetById(id: string): Reset | undefined {
  return RESETS.find((reset) => reset.id === id);
}

/** Resets appropriate to a given state band, best-fit first. */
export function resetsForBand(band: StateBand): Reset[] {
  return RESETS.filter((reset) => reset.bands.includes(band)).sort(
    (a, b) => a.durationMinutes - b.durationMinutes
  );
}
