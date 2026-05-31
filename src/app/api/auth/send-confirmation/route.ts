import { NextResponse } from "next/server";
import { sendAuthConfirmationEmail } from "@/lib/email/send-auth-email";
import { getAppOrigin } from "@/lib/email/resend";
import {
  RATE_LIMIT_USER_MESSAGE,
  RESEND_SUCCESS_MESSAGE,
} from "@/lib/auth/confirmation-messages";

export const runtime = "nodejs";

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

    if (result.reason === "rate_limited") {
      return NextResponse.json({
        success: true,
        message: RATE_LIMIT_USER_MESSAGE,
        rateLimited: true,
      });
    }

    return NextResponse.json({
      success: true,
      message: RESEND_SUCCESS_MESSAGE,
    });
  } catch (error) {
    console.error("Send confirmation error:", error);
    return NextResponse.json(
      {
        error:
          "We couldn't send the email right now. Check your inbox — a link may already be on its way.",
      },
      { status: 500 }
    );
  }
}
