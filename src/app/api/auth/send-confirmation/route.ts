import { NextResponse } from "next/server";
import { sendAuthConfirmationEmail } from "@/lib/email/send-auth-email";
import { getAppOrigin } from "@/lib/email/resend";

export const runtime = "nodejs";

const SUCCESS_MESSAGE =
  "If an account exists for this email, we sent a confirmation link. Check your inbox and spam folder.";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: string;
      redirectTo?: string;
    };

    const email = body.email?.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    const redirectTo =
      body.redirectTo ??
      `${getAppOrigin()}/auth/callback?next=/onboarding`;

    const result = await sendAuthConfirmationEmail({ email, redirectTo });

    if (result.reason === "already_confirmed") {
      return NextResponse.json({
        success: true,
        message: "This email is already confirmed. You can sign in.",
        alreadyConfirmed: true,
      });
    }

    return NextResponse.json({
      success: true,
      message: result.sent ? SUCCESS_MESSAGE : SUCCESS_MESSAGE,
    });
  } catch (error) {
    console.error("Send confirmation error:", error);
    const message =
      error instanceof Error ? error.message.toLowerCase() : "";

    if (message.includes("rate limit") || message.includes("too many")) {
      return NextResponse.json(
        { error: "Too many attempts. Wait a minute, then try again." },
        { status: 429 }
      );
    }

    return NextResponse.json(
      {
        error:
          "We couldn't send the email right now. Try Google sign-in, or wait a minute and tap Resend.",
      },
      { status: 500 }
    );
  }
}
