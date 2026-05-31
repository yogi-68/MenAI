/** Sends signup confirmation — Resend when configured, Supabase mail as fallback. */
export async function requestSignupConfirmationEmail(
  email: string
): Promise<{ message: string; alreadyConfirmed?: boolean }> {
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
  };

  if (!res.ok) {
    throw new Error(data.error || "We couldn't send the confirmation email.");
  }

  return {
    message: data.message || "Check your email for a confirmation link.",
    alreadyConfirmed: data.alreadyConfirmed,
  };
}
