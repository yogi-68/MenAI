import type { GenerateLinkParams } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  buildAuthEmailHtml,
  buildConfirmationUrl,
  getAuthEmailSubject,
  getProjectRefFromUrl,
  type AuthEmailAction,
} from "@/lib/email/auth-email-templates";
import { getAppOrigin, getResendClient, getResendFromAddress } from "@/lib/email/resend";
import {
  isResendDomainError,
  sendSupabaseAuthResend,
} from "@/lib/email/supabase-auth-resend";
import { isRateLimitError } from "@/lib/auth/confirmation-messages";

export type SendConfirmationResult = {
  ok: true;
  sent: boolean;
  provider: "resend" | "supabase";
  reason?: "not_found" | "already_confirmed" | "rate_limited";
};

/** Only use Resend when the sender domain is verified — avoids a failed send + Supabase retry. */
function shouldUseResend(): boolean {
  if (!process.env.RESEND_API_KEY) return false;
  if (process.env.RESEND_DOMAIN_VERIFIED === "true") return true;
  const from = getResendFromAddress().toLowerCase();
  if (from.includes("onboarding@resend.dev")) return false;
  if (from.includes("@menai.ai")) return false;
  return true;
}

async function trySendViaResend(email: string, redirectTo: string): Promise<void> {
  const linkType: GenerateLinkParams["type"] = "magiclink";
  const admin = await createServiceRoleClient();

  const { data, error } = await admin.auth.admin.generateLink({
    type: linkType,
    email,
    options: { redirectTo },
  });

  if (error) {
    if (error.message.toLowerCase().includes("user not found")) {
      throw new Error("__USER_NOT_FOUND__");
    }
    if (isRateLimitError(error.message)) {
      throw new Error("__RATE_LIMITED__");
    }
    throw error;
  }

  if (!data.properties?.action_link) {
    throw new Error("Failed to generate confirmation link");
  }

  if (data.user?.email_confirmed_at) {
    throw new Error("__ALREADY_CONFIRMED__");
  }

  const resend = getResendClient();
  const { error: sendError } = await resend.emails.send({
    from: getResendFromAddress(),
    to: [email],
    subject: getAuthEmailSubject("signup"),
    html: buildAuthEmailHtml({
      action: "signup",
      confirmUrl: data.properties.action_link,
      token: "email_otp" in data.properties ? data.properties.email_otp : undefined,
    }),
  });

  if (sendError) {
    throw new Error(sendError.message);
  }
}

export async function sendAuthConfirmationEmail(params: {
  email: string;
  redirectTo?: string;
}): Promise<SendConfirmationResult> {
  const email = params.email.trim().toLowerCase();
  const redirectTo = params.redirectTo ?? `${getAppOrigin()}/auth/callback?next=/onboarding`;

  if (shouldUseResend()) {
    try {
      await trySendViaResend(email, redirectTo);
      return { ok: true, sent: true, provider: "resend" };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "__USER_NOT_FOUND__") {
        return { ok: true, sent: false, provider: "supabase", reason: "not_found" };
      }
      if (message === "__ALREADY_CONFIRMED__") {
        return { ok: true, sent: false, provider: "supabase", reason: "already_confirmed" };
      }
      if (message === "__RATE_LIMITED__") {
        return { ok: true, sent: false, provider: "supabase", reason: "rate_limited" };
      }
      if (!isResendDomainError(message)) {
        console.warn("Resend failed, falling back to Supabase auth email:", message);
      }
    }
  }

  try {
    await sendSupabaseAuthResend({ email, redirectTo, type: "signup" });
    return { ok: true, sent: true, provider: "supabase" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "__RATE_LIMITED__" || isRateLimitError(message)) {
      return { ok: true, sent: false, provider: "supabase", reason: "rate_limited" };
    }
    throw error;
  }
}

export async function sendAuthEmailFromHookPayload(payload: {
  user: { email: string };
  email_data: {
    token?: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: string;
  };
}): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
  }

  const action = (payload.email_data.email_action_type || "signup") as
    | AuthEmailAction
    | "email_change_new"
    | "reauthentication";
  const templateAction: AuthEmailAction =
    action === "email_change_new"
      ? "email_change"
      : action === "reauthentication"
        ? "signup"
        : action;
  const confirmUrl = buildConfirmationUrl({
    projectRef: getProjectRefFromUrl(supabaseUrl),
    tokenHash: payload.email_data.token_hash,
    actionType: payload.email_data.email_action_type,
    redirectTo: payload.email_data.redirect_to || `${getAppOrigin()}/auth/callback?next=/onboarding`,
  });

  const resend = getResendClient();
  const { error } = await resend.emails.send({
    from: getResendFromAddress(),
    to: [payload.user.email],
    subject: getAuthEmailSubject(templateAction),
    html: buildAuthEmailHtml({
      action: templateAction,
      confirmUrl,
      token: payload.email_data.token,
    }),
  });

  if (error) {
    throw new Error(error.message);
  }
}
