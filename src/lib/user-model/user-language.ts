/** User-facing labels — mentor briefing, not dashboard fields. */

export const USER_LABELS = {
  whatMattersMost: "Today's focus",
  whatElseWorkingOn: "What else you're working on",
  personalBriefing: "Your briefing",
  longTermInterest: "Long-term direction",
  currentFocus: "Today's focus",
  todaysFocus: "Today's focus",
  watchOut: "Watch out",
  mostImportant: "Most important task",
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
    return formatFocusLine(title, targetDate);
  }
  return formatFocusLine(title, targetDate);
}
