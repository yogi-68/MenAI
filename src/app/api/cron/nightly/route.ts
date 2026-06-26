import { NextRequest, NextResponse } from "next/server";
import { runNightlySynthesis } from "@/lib/ai/orchestrator/synthesis-worker";

export const runtime = "nodejs";

/** Vercel Cron — nightly user-model + cognitive synthesis */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runNightlySynthesis();
  return NextResponse.json({ ok: true, ...result });
}
