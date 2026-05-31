import { Resend } from "resend";

let resendClient: Resend | undefined;

export function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

export function getResendFromAddress(): string {
  return process.env.RESEND_FROM_EMAIL || "MenAI <onboarding@resend.dev>";
}

export function getAppOrigin(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "https://men-ai.vercel.app";
}
