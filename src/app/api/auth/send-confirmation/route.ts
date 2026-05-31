import { NextResponse } from "next/server";
import { sendAuthConfirmationEmail } from "@/lib/email/send-auth-email";
import { getAppOrigin } from "@/lib/email/resend";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { error: "Email service is not configured" },
        { status: 503 }
      );
    }

    const body = (await request.json()) as {
      email?: string;
      redirectTo?: string;
    };

    const email = body.email?.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }

    const redirectTo =
      body.redirectTo ??
      `${getAppOrigin()}/auth/callback?next=/onboarding`;

    await sendAuthConfirmationEmail({ email, redirectTo });

    // Generic success — avoids email enumeration
    return NextResponse.json({
      success: true,
      message: "If an account exists for this email, a confirmation link was sent.",
    });
  } catch (error) {
    console.error("Send confirmation error:", error);
    return NextResponse.json(
      { error: "Could not send confirmation email. Try again in a minute." },
      { status: 500 }
    );
  }
}
