import {
  RATE_LIMIT_USER_MESSAGE,
  RESEND_SUCCESS_MESSAGE,
} from "@/lib/auth/confirmation-messages";

export type ConfirmationEmailResult = {
  message: string;
  alreadyConfirmed?: boolean;
  rateLimited?: boolean;
};

/** Sends signup confirmation — Resend when verified, Supabase mail otherwise. */
export async function requestSignupConfirmationEmail(
  email: string
): Promise<ConfirmationEmailResult> {
  const redirectTo = `${window.location.origin}/auth/callback?next=/onboarding`;
  const res = await fetch("/api/auth/send-confirmation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim(), redirectTo }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
    alreadyConfirmed?: boolean;
    rateLimited?: boolean;
  };

  if (!res.ok) {
    throw new Error(data.error || "We couldn't send the confirmation email.");
  }

  return {
    message: data.message || RESEND_SUCCESS_MESSAGE,
    alreadyConfirmed: data.alreadyConfirmed,
    rateLimited: data.rateLimited,
  };
}

export { RATE_LIMIT_USER_MESSAGE, RESEND_SUCCESS_MESSAGE };
