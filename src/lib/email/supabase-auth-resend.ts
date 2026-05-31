import { getAppOrigin } from "@/lib/email/resend";
import { isRateLimitError } from "@/lib/auth/confirmation-messages";

/** Fallback when Resend is unavailable or the sender domain isn't verified yet. */
export async function sendSupabaseAuthResend(params: {
  email: string;
  redirectTo?: string;
  type?: "signup" | "magiclink" | "recovery";
}): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error("Supabase auth is not configured");
  }

  const redirectTo =
    params.redirectTo ?? `${getAppOrigin()}/auth/callback?next=/onboarding`;

  const res = await fetch(`${supabaseUrl}/auth/v1/resend`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: params.type ?? "signup",
      email: params.email.trim().toLowerCase(),
      options: { emailRedirectTo: redirectTo },
    }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      msg?: string;
      error_description?: string;
      message?: string;
    };
    const message =
      body.msg ||
      body.error_description ||
      body.message ||
      "Could not send confirmation email";
    if (isRateLimitError(message)) {
      throw new Error("__RATE_LIMITED__");
    }
    throw new Error(message);
  }
}

export function isResendDomainError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("domain is not verified") ||
    lower.includes("verify a domain") ||
    lower.includes("only send testing emails") ||
    lower.includes("not authorized to send")
  );
}
