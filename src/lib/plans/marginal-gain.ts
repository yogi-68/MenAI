import type { MissingVariable } from "@/lib/plans/coach-insights";

export const MARGINAL_GAIN_STOP = 3;
export const MAX_INTERVIEW_QUESTIONS_PER_DAY = 5;
export const INTERVIEW_STOP_OVERALL = 78;

const EXPECTED_GAINS = [25, 18, 11, 8, 5, 3];

export function assignExpectedGains(
  missing: Omit<MissingVariable, "expectedGain">[]
): MissingVariable[] {
  return missing.map((m, i) => ({
    ...m,
    expectedGain: EXPECTED_GAINS[Math.min(i, EXPECTED_GAINS.length - 1)],
  }));
}

export function pickHighestGainGap(
  missing: MissingVariable[],
  alreadyAsked: string[]
): MissingVariable | null {
  const remaining = missing.filter((m) => !alreadyAsked.includes(m.id));
  if (remaining.length === 0) return null;
  return [...remaining].sort((a, b) => b.expectedGain - a.expectedGain)[0];
}
