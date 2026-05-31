/** User-facing labels — keep DB/internal terms out of UI copy. */

export const USER_LABELS = {
  whatMattersMost: "What matters most right now",
  whatElseWorkingOn: "What else you're working on",
  whatsClear: "What's clear",
  whatsStillUnclear: "What's still unclear",
  longTermInterest: "Long-term interest",
  currentFocus: "What matters most right now",
  executionMix: "Today's time mix",
  todaysFocus: "Today's focus",
} as const;

export function formatFocusLine(title: string, targetDate: string | null): string {
  if (targetDate) {
    const d = new Date(targetDate).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return `${title} (by ${d})`;
  }
  return title;
}

export function formatPortfolioLine(title: string, isFocus: boolean, targetDate: string | null): string {
  if (isFocus) {
    return `${USER_LABELS.whatMattersMost}: ${formatFocusLine(title, targetDate)}`;
  }
  return `${USER_LABELS.whatElseWorkingOn}: ${formatFocusLine(title, targetDate)}`;
}
