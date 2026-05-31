export function isRateLimitError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("rate limit") ||
    lower.includes("too many") ||
    lower.includes("over_request_rate_limit") ||
    lower.includes("email rate limit") ||
    lower.includes("for security purposes")
  );
}

export const RATE_LIMIT_USER_MESSAGE =
  "We already sent a confirmation link recently. Check your inbox and spam folder — it can take a minute to arrive.";

export const RESEND_SUCCESS_MESSAGE =
  "Confirmation email sent. Check your inbox and spam folder.";
