import { NextRequest, NextResponse } from "next/server";
import { runNightlySynthesis } from "@/lib/ai/orchestrator/synthesis-worker";
import { logger, requestIdFrom } from "@/lib/observability/logger";
import { apiError, apiInternalError } from "@/lib/api/errors";

export const runtime = "nodejs";
/** Synthesis is LLM-heavy and batched; give it the full Fluid window. */
export const maxDuration = 300;

/**
 * Nightly user-model + cognitive synthesis. Invoked by Vercel Cron.
 *
 * Fails CLOSED. A missing CRON_SECRET previously short-circuited the guard and
 * left this route publicly callable — and it loops every active user through
 * LLM synthesis, so an open door here is both a data and a spend problem.
 */
export async function GET(req: NextRequest) {
  const requestId = requestIdFrom(req.headers);
  const log = logger.child({ requestId, scope: "cron/nightly" });

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    log.error("CRON_SECRET is not configured — refusing to run");
    return apiError("forbidden", { message: "Cron is not configured." });
  }

  if (req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    log.warn("rejected unauthorized cron invocation");
    return apiError("unauthorized");
  }

  const startedAt = Date.now();
  try {
    const result = await runNightlySynthesis();
    log.info("nightly synthesis complete", { durationMs: Date.now() - startedAt, ...result });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return apiInternalError("cron/nightly", error, { requestId });
  }
}
