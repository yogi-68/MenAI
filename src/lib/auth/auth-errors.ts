import type { AuthError } from "@supabase/supabase-js";

export type AuthErrorKind =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "google_only"
  | "rate_limited"
  | "generic";

export function classifyAuthError(error: AuthError): AuthErrorKind {
  const message = error.message.toLowerCase();
  const code = (error as AuthError & { code?: string }).code?.toLowerCase() ?? "";

  if (
    message.includes("email not confirmed") ||
    code === "email_not_confirmed"
  ) {
    return "email_not_confirmed";
  }

  if (
    message.includes("invalid login credentials") ||
    message.includes("invalid credentials") ||
    code === "invalid_credentials"
  ) {
    return "invalid_credentials";
  }

  if (message.includes("rate limit") || code === "over_request_rate_limit") {
    return "rate_limited";
  }

  return "generic";
}

export function getAuthErrorMessage(kind: AuthErrorKind): string {
  switch (kind) {
    case "email_not_confirmed":
      return "Confirm your email before signing in. Check your inbox and spam folder.";
    case "invalid_credentials":
      return "Email or password didn't match. If you signed up with Google, use Continue with Google instead.";
    case "google_only":
      return "This account uses Google sign-in. Click Continue with Google — password login isn't set up for this email.";
    case "rate_limited":
      return "Check your inbox and spam folder — a confirmation link may already be on its way.";
    default:
      return "Sign-in failed. Check your details or try Google sign-in.";
  }
}
