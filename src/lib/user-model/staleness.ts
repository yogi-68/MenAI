const STALE_MS = 26 * 60 * 60 * 1000;

/** True when user model synthesis is older than 26 hours (nightly cron may have missed). */
export function isUserModelStale(
  updatedAt: string | null | undefined,
  synthesizedAt?: string | null
): boolean {
  const ts = updatedAt ?? synthesizedAt;
  if (!ts) return true;
  return Date.now() - new Date(ts).getTime() > STALE_MS;
}
