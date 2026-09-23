import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendAuthConfirmationEmail } from "@/lib/email/send-auth-email";
import { getAppOrigin } from "@/lib/email/resend";
import { RESEND_SUCCESS_MESSAGE } from "@/lib/auth/confirmation-messages";
import { apiError } from "@/lib/api/errors";
import { RATE_LIMITS, rateLimit, rateLimitHeaders, clientIdentifier } from "@/lib/api/rate-limit";
import { logger, requestIdFrom } from "@/lib/observability/logger";

export const runtime = "nodejs";

const BodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  /** Only ever a path on this origin — an absolute URL would be an open redirect. */
  redirectTo: z.string().startsWith("/").max(512).optional(),
});

/**
 * Resend an auth confirmation email.
 *
 * Necessarily unauthenticated: the caller is a user who cannot sign in yet.
 * That makes two protections load-bearing.
 *
 * 1. Rate limiting per client. This endpoint reaches a service-role admin
 *    client that mints magic links, so an unthrottled loop here burns the
 *    Supabase and Resend quota for every user.
 *
 * 2. A uniform response. It previously returned distinguishable bodies for
 *    "already confirmed", "rate limited" and "sent", which let anyone test
 *    whether an address had an account — on a mental-health product, that
 *    membership alone is sensitive. Every outcome now looks identical, and
 *    the real result is recorded server-side only.
 */
export async function POST(request: NextRequest) {
  const requestId = requestIdFrom(request.headers);
  const log = logger.child({ requestId, scope: "auth/send-confirmation" });

  const limit = await rateLimit(
    `send-confirmation:${clientIdentifier(request.headers)}`,
    RATE_LIMITS.auth
  );
  if (!limit.allowed) {
    return apiError("rate_limited", { headers: rateLimitHeaders(limit) });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return apiError("invalid_request", { message: "Invalid JSON body." });
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return apiError("invalid_request", { message: "Enter a valid email address." });
  }

  const { email, redirectTo } = parsed.data;
  const target = `${getAppOrigin()}${redirectTo ?? "/auth/callback?next=/onboarding"}`;

  try {
    const result = await sendAuthConfirmationEmail({ email, redirectTo: target });
    log.info("confirmation email processed", { outcome: result.reason ?? "sent" });
  } catch (error) {
    // Still answered uniformly below: a failure here must not be
    // distinguishable from a success, or it becomes the same oracle.
    log.error("confirmation email failed", error);
  }

  return NextResponse.json(
    { success: true, message: RESEND_SUCCESS_MESSAGE },
    { headers: rateLimitHeaders(limit) }
  );
}
