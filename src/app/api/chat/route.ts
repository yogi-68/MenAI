/**
 * Chat API Route — /api/chat
 * 
 * Uses the AI Orchestrator for the full pipeline:
 * Safety → Emotion → State Machine → Memory → LLM Router → Streaming Response
 * 
 * Returns a streaming response with metadata in custom headers.
 */

import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { orchestrateStreaming } from "@/lib/ai/orchestrator";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { message, conversationId } = await request.json();

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const result = await orchestrateStreaming({
      userId: user.id,
      message: message.trim(),
      conversationId: conversationId || null,
    });

    return new Response(result.stream, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "X-Conversation-Id": result.metadata.conversationId,
        "X-Crisis": String(result.metadata.crisis),
        "X-Crisis-Level": result.metadata.crisisLevel || "",
        "X-Emotion": result.metadata.emotion?.primaryEmotion || "",
        "X-Emotion-Intensity": String(result.metadata.emotion?.intensity || 0),
        "X-State": result.metadata.state,
        "X-Model": result.metadata.modelUsed,
      },
    });
  } catch (error) {
    console.error("Chat API Error:", error);
    return new Response(
      JSON.stringify({
        error: "Something went wrong. Please try again.",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
