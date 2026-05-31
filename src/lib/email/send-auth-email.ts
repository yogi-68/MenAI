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

export type SendConfirmationResult =
  | { ok: true; sent: true }
  | { ok: true; sent: false; reason: "not_found" | "already_confirmed" };

export async function sendAuthConfirmationEmail(params: {
  email: string;
  redirectTo?: string;
}): Promise<SendConfirmationResult> {
  const email = params.email.trim().toLowerCase();
  const redirectTo = params.redirectTo ?? `${getAppOrigin()}/auth/callback?next=/onboarding`;
  const linkType: GenerateLinkParams["type"] = "magiclink";

  const admin = await createServiceRoleClient();

  const { data, error } = await admin.auth.admin.generateLink({
    type: linkType,
    email,
    options: { redirectTo },
  });

  if (error) {
    if (error.message.toLowerCase().includes("user not found")) {
      return { ok: true, sent: false, reason: "not_found" };
    }
    throw error;
  }

  if (!data.properties?.action_link) {
    throw new Error("Failed to generate confirmation link");
  }

  if (data.user?.email_confirmed_at) {
    return { ok: true, sent: false, reason: "already_confirmed" };
  }

  const resend = getResendClient();
  const { error: sendError } = await resend.emails.send({
    from: getResendFromAddress(),
    to: [email],
    subject: getAuthEmailSubject("magiclink"),
    html: buildAuthEmailHtml({
      action: "signup",
      confirmUrl: data.properties.action_link,
      token: "email_otp" in data.properties ? data.properties.email_otp : undefined,
    }),
  });

  if (sendError) {
    throw new Error(sendError.message);
  }

  return { ok: true, sent: true };
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
