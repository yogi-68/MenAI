/** Tasks must be completable in one sitting today — not lifetime goals restated. */

const VAGUE_PATTERNS = [
  /^make progress on/i,
  /^progress on/i,
  /^work on/i,
  /^improve /i,
  /^focus on/i,
  /^build (a |the )?(scalable )?business/i,
  /^build scalable/i,
  /^build recurring/i,
  /^build wealth/i,
  /^achieve /i,
  /^increase income/i,
  /^increase /i,
  /^create wealth/i,
  /^financial freedom/i,
  /^get healthier/i,
  /^improve fitness/i,
  /^study more/i,
  /^network\b/i,
  /^network more/i,
  /cash flow$/i,
  /^continue /i,
  /^start working/i,
  /^work toward/i,
  /^spend time on/i,
  /^think about/i,
  /^plan for/i,
  /^research more/i,
  /^learn more about/i,
  /^become /i,
  /^goals?$/i,
];

export function isVagueTask(title: string): boolean {
  const normalized = title.trim();
  if (normalized.length < 12) return true;
  return VAGUE_PATTERNS.some((p) => p.test(normalized));
}

export function isFinishableTodayTask(title: string): boolean {
  const normalized = title.trim();
  if (!normalized || isVagueTask(normalized)) return false;
  if (normalized.length > 120) return false;
  return true;
}

export function finishableTaskError(title: string): string | null {
  if (isFinishableTodayTask(title)) return null;
  return "Tasks must be finishable today — e.g. \"Send 5 outreach emails\", not \"Build scalable businesses\". Link work to an initiative and use Today's Plan for daily tasks.";
}
