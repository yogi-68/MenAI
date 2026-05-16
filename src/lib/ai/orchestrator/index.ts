/**
 * AI Orchestrator — The Brain of MenAI
 * 
 * Pipeline:
 * 1. Safety Engine     → Crisis detection + moderation
 * 2. Emotion Engine    → Emotional analysis
 * 3. State Machine     → Determine conversation mode
 * 4. Memory Engine     → Retrieve relevant context
 * 5. LLM Router        → Select optimal model
 * 6. Prompt Builder    → Construct dynamic prompt
 * 7. LLM Call          → Generate response
 * 8. Response Validator → Output safety check
 * 9. Memory Storage    → Store for future context
 */

import { createServiceRoleClient } from "@/lib/supabase/server";
import { runSafetyPipeline } from "./safety-engine";
import { detectEmotion } from "./emotion-engine";
import { determineState } from "./state-machine";
import { getMemoryContext, storeMemory, summarizeConversation, compressMemories } from "./memory-engine";
import { selectModel, callLLM } from "./router";
import { buildPrompt } from "./prompt-builder";
import { validateResponse } from "./response-validator";
import type { OrchestratorInput, OrchestratorOutput, PipelineContext, UserProfile } from "./types";

/**
 * Main orchestrator — process a user message through the full pipeline
 */
export async function orchestrate(input: OrchestratorInput): Promise<OrchestratorOutput> {
  const serviceClient = await createServiceRoleClient();

  // ===== STEP 1: Safety Check (fastest, runs first) =====
  const safety = await runSafetyPipeline(input.message);

  // If critical crisis — respond immediately, don't continue pipeline
  if (safety.requiresEscalation && safety.crisisResponse) {
    // Log crisis event
    try {
      await serviceClient.from("crisis_events").insert({
        user_id: input.userId,
        conversation_id: input.conversationId || null,
        crisis_level: safety.level,
        categories: safety.categories,
        matched_patterns: [],
        confidence: safety.confidence,
        escalated: true,
      });
    } catch { /* non-blocking */ }

    // Save messages if conversation exists
    if (input.conversationId) {
      try {
        await serviceClient.from("messages").insert([
          { conversation_id: input.conversationId, user_id: input.userId, role: "user", content: input.message },
          { conversation_id: input.conversationId, user_id: input.userId, role: "assistant", content: safety.crisisResponse },
        ]);
      } catch { /* non-blocking */ }
    }

    return {
      response: safety.crisisResponse,
      conversationId: input.conversationId || "",
      crisis: true,
      crisisLevel: safety.level,
      emotion: null,
      state: "ESCALATION",
      modelUsed: "rule-based",
      tokensUsed: 0,
      resources: safety.resources,
    };
  }

  // ===== STEP 2: Emotion Detection =====
  const emotion = await detectEmotion(input.message);

  // ===== STEP 3: Get or Create Conversation =====
  let conversationId = input.conversationId || "";
  if (!conversationId) {
    const { data: newConv } = await serviceClient
      .from("conversations")
      .insert({ user_id: input.userId, title: input.message.slice(0, 50) })
      .select("id")
      .single();
    conversationId = newConv?.id || "";
  }

  // Save user message
  await serviceClient.from("messages").insert({
    conversation_id: conversationId,
    user_id: input.userId,
    role: "user",
    content: input.message,
  });

  // ===== STEP 4: Load Context =====
  // Parallel: conversation history, memory, user profile
  const [historyResult, memory, profileResult] = await Promise.all([
    serviceClient
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(30),
    getMemoryContext(input.userId, input.message),
    serviceClient
      .from("profiles")
      .select("full_name, therapy_goals")
      .eq("id", input.userId)
      .single(),
  ]);

  const conversationHistory = (historyResult.data || []).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const user: UserProfile = {
    id: input.userId,
    fullName: profileResult.data?.full_name || undefined,
    therapyGoals: profileResult.data?.therapy_goals || [],
    sessionCount: conversationHistory.length,
  };

  // ===== STEP 5: Determine Conversation State =====
  const state = determineState({
    emotion,
    safety,
    messageCount: conversationHistory.length,
    userMessage: input.message,
  });

  // ===== STEP 6: Select Model =====
  const modelConfig = selectModel({
    emotion,
    safety,
    state,
    messageLength: input.message.length,
  });

  // ===== STEP 7: Build Pipeline Context =====
  const ctx: PipelineContext = {
    input,
    user,
    safety,
    emotion,
    memory,
    state,
    conversationHistory: conversationHistory.slice(0, -1), // Exclude just-added message
    conversationId,
    modelConfig,
  };

  // ===== STEP 8: Build Prompt & Call LLM =====
  const promptMessages = buildPrompt(ctx);
  const llmResult = await callLLM(promptMessages, modelConfig);

  // ===== STEP 9: Validate Response =====
  const validated = validateResponse(llmResult.content, {
    crisisMode: safety.level !== "safe",
    emotionIntensity: emotion.intensity,
  });

  if (validated.flags.length > 0) {
    console.warn("Response validation flags:", validated.flags);
  }

  // ===== STEP 10: Save AI Response =====
  await serviceClient.from("messages").insert({
    conversation_id: conversationId,
    user_id: input.userId,
    role: "assistant",
    content: validated.content,
    emotion_data: emotion,
    token_count: llmResult.tokensUsed,
  });

  // Update conversation metadata
  await serviceClient
    .from("conversations")
    .update({
      updated_at: new Date().toISOString(),
      message_count: conversationHistory.length + 2,
      emotional_state: emotion.primaryEmotion,
    })
    .eq("id", conversationId);

  // ===== STEP 11: Background Tasks (non-blocking) =====
  // Store memory
  storeMemory({
    userId: input.userId,
    content: `User: "${input.message.slice(0, 200)}". State: ${state}. Emotion: ${emotion.primaryEmotion} (${emotion.intensity}/10).`,
    memoryType: "conversation",
    importance: emotion.intensity > 6 ? 0.8 : 0.5,
    metadata: { conversation_id: conversationId, state },
  }).catch(() => {});

  // Summarize after every 20 messages
  if (conversationHistory.length > 0 && conversationHistory.length % 20 === 0) {
    summarizeConversation(conversationHistory).then(async (summary) => {
      await storeMemory({
        userId: input.userId,
        content: `[Session Summary] ${summary.summary}. Key events: ${summary.keyEvents.join(", ")}. Emotional arc: ${summary.emotionalArc}.`,
        memoryType: "insight",
        importance: 0.9,
        metadata: { conversation_id: conversationId, type: "session_summary" },
      });
    }).catch(() => {});
  }

  // Compress old memories periodically
  if (conversationHistory.length % 50 === 0) {
    compressMemories(input.userId).catch(() => {});
  }

  return {
    response: validated.content,
    conversationId,
    crisis: false,
    emotion,
    state,
    modelUsed: llmResult.model,
    tokensUsed: llmResult.tokensUsed,
  };
}
