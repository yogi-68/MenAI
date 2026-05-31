const COOLDOWN_MS = 60_000;
const STORAGE_PREFIX = "menai-resend:";

function storageKey(email: string): string {
  return `${STORAGE_PREFIX}${email.trim().toLowerCase()}`;
}

export function getResendCooldownSeconds(email: string): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = sessionStorage.getItem(storageKey(email));
    if (!raw) return 0;
    const remaining = Math.ceil((Number(raw) - Date.now()) / 1000);
    return remaining > 0 ? remaining : 0;
  } catch {
    return 0;
  }
}

export function markResendCooldown(email: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(storageKey(email), String(Date.now() + COOLDOWN_MS));
  } catch {
    // ignore
  }
}

export function canResendNow(email: string): boolean {
  return getResendCooldownSeconds(email) === 0;
}
