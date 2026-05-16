import { NextRequest } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getOpenAI, CHAT_MODEL, moderateContent } from "@/lib/ai/openai";
import { detectCrisis, getCrisisResponseMessage } from "@/lib/ai/crisis-detection";
import { buildChatPrompt, buildEmotionPrompt } from "@/lib/ai/prompts";
import { getMemoryContext, storeMemory } from "@/lib/ai/memory";

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

    const serviceClient = await createServiceRoleClient();

    // ===== STEP 1: Crisis Detection (Rule-based, instant) =====
    const crisisResult = detectCrisis(message);

    if (crisisResult.requiresEscalation) {
      // Log crisis event
      await serviceClient.from("crisis_events").insert({
        user_id: user.id,
        conversation_id: conversationId || null,
        crisis_level: crisisResult.level,
        categories: crisisResult.categories,
        matched_patterns: crisisResult.matchedPatterns,
        confidence: crisisResult.confidence,
        escalated: true,
      });

      const crisisResponse = getCrisisResponseMessage(crisisResult);

      // Save messages
      if (conversationId) {
        await serviceClient.from("messages").insert([
          {
            conversation_id: conversationId,
            user_id: user.id,
            role: "user",
            content: message,
          },
          {
            conversation_id: conversationId,
            user_id: user.id,
            role: "assistant",
            content: crisisResponse,
          },
        ]);
      }

      return new Response(
        JSON.stringify({
          response: crisisResponse,
          crisis: true,
          crisisLevel: crisisResult.level,
          resources: crisisResult.emergencyResources,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // ===== STEP 2: Content Moderation (OpenAI) =====
    const moderation = await moderateContent(message);
    if (moderation.flagged) {
      // Log but continue with caution — moderation catches general content policy
      console.log("Content moderation flagged:", moderation.categories);
    }

    // ===== STEP 3: Get or Create Conversation =====
    let activeConversationId = conversationId;

    if (!activeConversationId) {
      const { data: newConv } = await serviceClient
        .from("conversations")
        .insert({
          user_id: user.id,
          title: message.slice(0, 50),
        })
        .select("id")
        .single();

      activeConversationId = newConv?.id;
    }

    // Save user message
    await serviceClient.from("messages").insert({
      conversation_id: activeConversationId,
      user_id: user.id,
      role: "user",
      content: message,
    });

    // ===== STEP 4: Retrieve Conversation History =====
    const { data: historyData } = await serviceClient
      .from("messages")
      .select("role, content")
      .eq("conversation_id", activeConversationId)
      .order("created_at", { ascending: true })
      .limit(30);

    const conversationHistory = (historyData || []).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    // ===== STEP 5: Retrieve Memory Context (RAG) =====
    let memoryContext = "";
    try {
      memoryContext = await getMemoryContext(user.id, message);
    } catch (e) {
      console.error("Memory retrieval error:", e);
    }

    // ===== STEP 6: Detect Emotion =====
    let emotionalContext = "";
    try {
      const emotionResponse = await getOpenAI().chat.completions.create({
        model: "gpt-4o-mini",
        messages: buildEmotionPrompt(message),
        max_tokens: 150,
        temperature: 0.3,
      });
      const emotionText = emotionResponse.choices[0]?.message?.content || "";
      emotionalContext = emotionText;
    } catch (e) {
      console.error("Emotion detection error:", e);
    }

    // ===== STEP 7: Get User Profile =====
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("full_name, therapy_goals")
      .eq("id", user.id)
      .single();

    // ===== STEP 8: Build Prompt & Call LLM =====
    const messages = buildChatPrompt({
      userMessage: message,
      conversationHistory: conversationHistory.slice(0, -1), // Exclude current message (already added)
      emotionalContext,
      memoryContext,
      userName: profile?.full_name || undefined,
    });

    const completion = await getOpenAI().chat.completions.create({
      model: CHAT_MODEL,
      messages,
      max_tokens: 500,
      temperature: 0.8,
      presence_penalty: 0.3,
      frequency_penalty: 0.3,
    });

    const aiResponse = completion.choices[0]?.message?.content || "I'm here for you. Could you tell me more about how you're feeling?";

    // ===== STEP 9: Save AI Response =====
    await serviceClient.from("messages").insert({
      conversation_id: activeConversationId,
      user_id: user.id,
      role: "assistant",
      content: aiResponse,
      emotion_data: (() => { try { return emotionalContext ? JSON.parse(emotionalContext) : null; } catch { return null; } })(),
      token_count: completion.usage?.total_tokens || 0,
    });

    // Update conversation metadata
    await serviceClient
      .from("conversations")
      .update({
        updated_at: new Date().toISOString(),
        message_count: (conversationHistory.length + 2),
      })
      .eq("id", activeConversationId);

    // ===== STEP 10: Store Memory (async, don't block response) =====
    storeMemory({
      userId: user.id,
      content: `User said: "${message.slice(0, 200)}". AI responded about: ${aiResponse.slice(0, 200)}`,
      memoryType: "conversation",
      metadata: {
        conversation_id: activeConversationId,
        emotion: emotionalContext,
      },
    }).catch((e) => console.error("Memory store error:", e));

    return new Response(
      JSON.stringify({
        response: aiResponse,
        conversationId: activeConversationId,
        crisis: false,
        emotion: emotionalContext || null,
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
        response: "I'm sorry, I'm having a moment. Could you try sending that again? 💙",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
