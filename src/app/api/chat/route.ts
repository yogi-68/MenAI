/**
 * Chat API — POST /api/chat
 *
 * Runs the orchestrator pipeline (safety → emotion → state → memory → router)
 * and streams the reply as plain text. Metadata that is known before the first
 * token travels in X-* headers; metadata that isn't known until the end — the
 * message id, any follow-up question — travels in the stream trailer defined
 * in @/lib/chat/stream-protocol.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { orchestrateStreaming } from "@/lib/ai/orchestrator";
import { apiError } from "@/lib/api/errors";
import { RATE_LIMITS, rateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { checkAiQuota, AI_QUOTA_MESSAGE } from "@/lib/ai/usage-guard";
import { logger, requestIdFrom } from "@/lib/observability/logger";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Upper bound on a single turn. Previously unbounded into the model. */
const MAX_MESSAGE_LENGTH = 4000;

const BodySchema = z.object({
  message: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
  conversationId: z.string().uuid().nullable().optional(),
  confidenceGoalId: z.string().uuid().nullable().optional(),
  sessionConfidenceAsked: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const requestId = requestIdFrom(request.headers);
  const log = logger.child({ requestId, scope: "chat" });

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return apiError("unauthorized");

    // Chat is the most expensive path in the product and was, until now,
    // entirely unmetered — no rate limit, and the "chat" branch of
    // checkAiQuota existed but was never called from anywhere.
    const limit = await rateLimit(`chat:${user.id}`, RATE_LIMITS.chat);
    if (!limit.allowed) {
      log.warn("chat rate limited", { userId: user.id });
      return apiError("rate_limited", { headers: rateLimitHeaders(limit) });
    }

    const quota = await checkAiQuota(user.id, "chat");
    if (!quota.allowed) {
      log.warn("chat quota exhausted", { userId: user.id, used: quota.used, limit: quota.limit });
      return apiError("quota_exceeded", { message: AI_QUOTA_MESSAGE });
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return apiError("invalid_request", { message: "Invalid JSON body." });
    }

    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return apiError("invalid_request", {
        message:
          raw && typeof raw === "object" && "message" in raw
            ? `Messages must be between 1 and ${MAX_MESSAGE_LENGTH} characters.`
            : "A message is required.",
      });
    }

    const body = parsed.data;
    const result = await orchestrateStreaming({
      userId: user.id,
      message: body.message,
      conversationId: body.conversationId ?? null,
      confidenceGoalId: body.confidenceGoalId ?? null,
      sessionConfidenceAsked: Boolean(body.sessionConfidenceAsked),
    });

    return new Response(result.stream, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Conversation-Id": result.metadata.conversationId,
        "X-Crisis": String(result.metadata.crisis),
        "X-Crisis-Level": result.metadata.crisisLevel || "",
        "X-Emotion": result.metadata.emotion?.primaryEmotion || "",
        "X-Emotion-Intensity": String(result.metadata.emotion?.intensity || 0),
        "X-State": result.metadata.state,
        "X-Model": result.metadata.modelUsed,
        ...rateLimitHeaders(limit),
      },
    });
  } catch (error) {
    // Previously this returned HTTP 200 with a fabricated reply, which meant
    // an outage was indistinguishable from a working conversation — to the
    // user and to any monitoring. The user still gets a calm message; the
    // status code now tells the truth.
    log.error("chat request failed", error);
    return apiError("internal", {
      message:
        "I couldn't get to that just now. Give it a moment and send it again.",
    });
  }
}
