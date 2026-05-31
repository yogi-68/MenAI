type AuthEmailAction = "signup" | "recovery" | "magiclink" | "invite" | "email_change";

export type { AuthEmailAction };

const SUBJECTS: Record<AuthEmailAction, string> = {
  signup: "Confirm your MenAI account",
  recovery: "Reset your MenAI password",
  magiclink: "Your MenAI sign-in link",
  invite: "You're invited to MenAI",
  email_change: "Confirm your new MenAI email",
};

export function getAuthEmailSubject(action: AuthEmailAction): string {
  return SUBJECTS[action] ?? "MenAI notification";
}

export function buildAuthEmailHtml(params: {
  action: AuthEmailAction;
  confirmUrl: string;
  token?: string;
}): string {
  const { action, confirmUrl, token } = params;

  const content: Record<AuthEmailAction, { title: string; body: string; cta: string }> = {
    signup: {
      title: "Confirm your email",
      body: "Click the button below to activate your MenAI account and start onboarding.",
      cta: "Confirm email",
    },
    recovery: {
      title: "Reset your password",
      body: "We received a request to reset your password. If this wasn't you, ignore this email.",
      cta: "Reset password",
    },
    magiclink: {
      title: "Sign in to MenAI",
      body: "Use this one-time link to sign in. It expires shortly.",
      cta: "Sign in",
    },
    invite: {
      title: "You're invited",
      body: "You've been invited to join MenAI. Accept the invitation to get started.",
      cta: "Accept invitation",
    },
    email_change: {
      title: "Confirm email change",
      body: "Confirm this change to update the email on your MenAI account.",
      cta: "Confirm new email",
    },
  };

  const copy = content[action];
  const otpBlock =
    token && action === "signup"
      ? `<p style="color:#64748b;font-size:14px;margin:24px 0 0;">Or enter this code: <strong style="color:#0f172a;letter-spacing:2px;">${token}</strong></p>`
      : "";

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0b0f19;font-family:Inter,Segoe UI,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:520px;background:#111827;border:1px solid #1e293b;border-radius:16px;padding:32px;">
          <tr>
            <td>
              <p style="margin:0 0 8px;color:#60a5fa;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">MenAI</p>
              <h1 style="margin:0 0 12px;color:#f8fafc;font-size:24px;line-height:1.3;">${copy.title}</h1>
              <p style="margin:0 0 28px;color:#94a3b8;font-size:15px;line-height:1.6;">${copy.body}</p>
              <a href="${confirmUrl}" style="display:inline-block;background:linear-gradient(135deg,#3b82f6,#6366f1);color:#fff;text-decoration:none;font-weight:600;padding:14px 24px;border-radius:10px;">${copy.cta}</a>
              ${otpBlock}
              <p style="margin:28px 0 0;color:#64748b;font-size:12px;line-height:1.6;">If the button doesn't work, copy this link:<br><span style="word-break:break-all;color:#94a3b8;">${confirmUrl}</span></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildConfirmationUrl(params: {
  projectRef: string;
  tokenHash: string;
  actionType: string;
  redirectTo: string;
}): string {
  const baseUrl = `https://${params.projectRef}.supabase.co/auth/v1/verify`;
  const query = new URLSearchParams({
    token: params.tokenHash,
    type: params.actionType,
    redirect_to: params.redirectTo,
  });
  return `${baseUrl}?${query.toString()}`;
}

export function getProjectRefFromUrl(supabaseUrl: string): string {
  return new URL(supabaseUrl).hostname.split(".")[0];
}
