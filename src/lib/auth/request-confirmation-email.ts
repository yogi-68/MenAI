/** Client helper — sends signup confirmation via Resend-backed API. */
export async function requestSignupConfirmationEmail(email: string): Promise<void> {
  const redirectTo = `${window.location.origin}/auth/callback?next=/onboarding`;
  const res = await fetch("/api/auth/send-confirmation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim(), redirectTo }),
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "Could not send confirmation email");
  }
}
