/**
 * The mental-state scale.
 *
 * This is the product's primary self-report instrument: a single 1–10 reading
 * plus optional named signals. Kept deliberately coarse — the value is in
 * reading it every day, not in precision on any one day.
 *
 * Framing note: these are performance states, not clinical categories. The
 * labels describe capacity to do work, which is what the coach acts on.
 */

export interface StateOption {
  score: number;
  label: string;
  /** One-line read of what this score means for the day's capacity. */
  capacity: string;
}

export const STATE_SCALE: readonly StateOption[] = [
  { score: 1, label: "Depleted", capacity: "Recovery only. No new load." },
  { score: 2, label: "Very low", capacity: "One small thing, if anything." },
  { score: 3, label: "Low", capacity: "Maintenance work. Nothing that needs depth." },
  { score: 4, label: "Below par", capacity: "Shallow work. Protect the easy wins." },
  { score: 5, label: "Flat", capacity: "Steady, unremarkable. Routine tasks land." },
  { score: 6, label: "Okay", capacity: "Most work is available to you." },
  { score: 7, label: "Good", capacity: "Deep work is on the table." },
  { score: 8, label: "Strong", capacity: "Take the hard thing first." },
  { score: 9, label: "Sharp", capacity: "Highest-leverage work. Don't waste it." },
  { score: 10, label: "Peak", capacity: "Rare. Spend it on what actually matters." },
] as const;

/** Signals a user can attach to a reading. Named, not scored. */
export const STATE_SIGNALS = [
  "Anxious",
  "Scattered",
  "Flat",
  "Frustrated",
  "Tired",
  "Wired",
  "Calm",
  "Focused",
  "Motivated",
  "Confident",
  "Overloaded",
  "Restless",
] as const;

export type StateSignal = (typeof STATE_SIGNALS)[number];

/** Coarse band, used for routing and for the coach's framing. */
export type StateBand = "depleted" | "low" | "steady" | "strong";

export function bandForScore(score: number): StateBand {
  if (score <= 2) return "depleted";
  if (score <= 4) return "low";
  if (score <= 7) return "steady";
  return "strong";
}

export function optionForScore(score: number): StateOption | undefined {
  return STATE_SCALE.find((option) => option.score === score);
}

/**
 * How much work to ask of someone in this state.
 *
 * The daily planner uses this to size the day rather than issuing a fixed
 * quota regardless of capacity — which is the single biggest difference
 * between a coach and a task list.
 */
export function taskLoadForBand(band: StateBand): number {
  switch (band) {
    case "depleted":
      return 1;
    case "low":
      return 2;
    case "steady":
      return 3;
    case "strong":
      return 3;
  }
}
