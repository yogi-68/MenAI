import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { Resend } from "npm:resend@4.0.1";

const resendApiKey = Deno.env.get("RESEND_API_KEY");
const hookSecretRaw = Deno.env.get("SEND_EMAIL_HOOK_SECRET");
const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") ?? "MenAI <onboarding@resend.dev>";
const projectRef = Deno.env.get("SUPABASE_PROJECT_REF") ?? "zshgaiqapgesppcvfnwz";

const SUBJECTS: Record<string, string> = {
  signup: "Confirm your MenAI account",
  recovery: "Reset your MenAI password",
  magiclink: "Your MenAI sign-in link",
  invite: "You're invited to MenAI",
  email_change: "Confirm your new MenAI email",
  email_change_new: "Confirm your new MenAI email",
  reauthentication: "Your MenAI verification code",
};

function buildHtml(action: string, confirmUrl: string, token?: string) {
  const title =
    action === "recovery"
      ? "Reset your password"
      : action === "magiclink"
        ? "Sign in to MenAI"
        : "Confirm your email";
  const body =
    action === "recovery"
      ? "We received a password reset request for your MenAI account."
      : action === "magiclink"
        ? "Use this one-time link to sign in to MenAI."
        : "Click below to confirm your email and finish setting up MenAI.";
  const cta =
    action === "recovery" ? "Reset password" : action === "magiclink" ? "Sign in" : "Confirm email";
  const otp = token
    ? `<p style="color:#64748b;font-size:14px;margin-top:24px;">Or use code: <strong>${token}</strong></p>`
    : "";

  return `<!DOCTYPE html><html><body style="margin:0;background:#0b0f19;font-family:Inter,sans-serif;">
<table width="100%" style="padding:40px 16px"><tr><td align="center">
<table style="max-width:520px;background:#111827;border:1px solid #1e293b;border-radius:16px;padding:32px">
<tr><td>
<p style="color:#60a5fa;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">MenAI</p>
<h1 style="color:#f8fafc;font-size:24px">${title}</h1>
<p style="color:#94a3b8;font-size:15px;line-height:1.6">${body}</p>
<a href="${confirmUrl}" style="display:inline-block;background:linear-gradient(135deg,#3b82f6,#6366f1);color:#fff;text-decoration:none;font-weight:600;padding:14px 24px;border-radius:10px;margin-top:8px">${cta}</a>
${otp}
</td></tr></table></td></tr></table></body></html>`;
}

function confirmationUrl(emailData: {
  token_hash: string;
  email_action_type: string;
  redirect_to: string;
}) {
  const params = new URLSearchParams({
    token: emailData.token_hash,
    type: emailData.email_action_type,
    redirect_to: emailData.redirect_to,
  });
  return `https://${projectRef}.supabase.co/auth/v1/verify?${params.toString()}`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!resendApiKey || !hookSecretRaw) {
    return new Response(JSON.stringify({ error: { message: "Missing email secrets" } }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const payload = await req.text();
  const headers = Object.fromEntries(req.headers);
  const hookSecret = hookSecretRaw.replace(/^v1,whsec_/, "");
  const wh = new Webhook(hookSecret);

  try {
    const { user, email_data } = wh.verify(payload, headers) as {
      user: { email: string };
      email_data: {
        token?: string;
        token_hash: string;
        redirect_to: string;
        email_action_type: string;
      };
    };

    const resend = new Resend(resendApiKey);
    const action = email_data.email_action_type;
    const confirmUrl = confirmationUrl(email_data);

    const { error } = await resend.emails.send({
      from: fromEmail,
      to: [user.email],
      subject: SUBJECTS[action] ?? "MenAI notification",
      html: buildHtml(action, confirmUrl, email_data.token),
    });

    if (error) {
      throw error;
    }

    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email send failed";
    return new Response(JSON.stringify({ error: { message } }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
});
