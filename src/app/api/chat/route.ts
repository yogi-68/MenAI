/**
 * Chat API Route — /api/chat
 * 
 * Now uses the AI Orchestrator for the full pipeline:
 * Safety → Emotion → State Machine → Memory → LLM Router → Response Validation
 */

import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { orchestrate } from "@/lib/ai/orchestrator";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
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

    // Run the full AI orchestrator pipeline
    const result = await orchestrate({
      userId: user.id,
      message: message.trim(),
      conversationId: conversationId || null,
    });

    return new Response(
      JSON.stringify({
        response: result.response,
        conversationId: result.conversationId,
        crisis: result.crisis,
        crisisLevel: result.crisisLevel || null,
        emotion: result.emotion || null,
        state: result.state,
        modelUsed: result.modelUsed,
        resources: result.resources || [],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Chat API Error:", error);
    return new Response(
      JSON.stringify({
        error: "Something went wrong. Please try again.",
        response: "I'm sorry, I had a moment there. Could you try saying that again? 💙",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
