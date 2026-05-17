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
import { selectModel, callLLM, callLLMStreaming } from "./router";
import { buildPrompt } from "./prompt-builder";
import { validateResponse } from "./response-validator";
import type { OrchestratorInput, OrchestratorOutput, PipelineContext, UserProfile, EmotionAnalysis } from "./types";

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

  // ===== STEP 4: Load Context (with smart RAG bypass) =====
  const skipMemory = shouldSkipMemory(input.message, emotion);
  const emptyMemory = { shortTerm: [] as string[], longTerm: [] as string[], episodic: [] as string[], emotional: [] as string[], formatted: "" };

  const [historyResult, memory, profileResult] = await Promise.all([
    serviceClient
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(30),
    skipMemory ? Promise.resolve(emptyMemory) : getMemoryContext(input.userId, input.message),
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

/**
 * Detect if a message is casual enough to skip expensive memory retrieval
 */
function shouldSkipMemory(message: string, emotion: EmotionAnalysis): boolean {
  const lower = message.trim().toLowerCase();
  const casualPatterns = [
    /^(hi|hey|hello|yo|sup|hola|good morning|good night|gm|gn)[\s!.]*$/,
    /^(thanks|thank you|thx|ty|cool|ok|okay|got it|makes sense)[\s!.]*$/,
    /^.{0,8}$/,
  ];
  if (casualPatterns.some((p) => p.test(lower))) return true;
  if (emotion.intensity <= 2 && emotion.sentiment !== "negative") return true;
  return false;
}

/**
 * Streaming orchestrator — runs the full pipeline but streams the LLM response.
 * Returns metadata + a ReadableStream for progressive rendering.
 */
export async function orchestrateStreaming(input: OrchestratorInput): Promise<{
  stream: ReadableStream<Uint8Array>;
  metadata: {
    conversationId: string;
    crisis: boolean;
    crisisLevel?: string;
    emotion: EmotionAnalysis | null;
    state: string;
    modelUsed: string;
    resources?: Array<{ name: string; phone: string; text?: string; url?: string; available: string }>;
  };
}> {
  const serviceClient = await createServiceRoleClient();

  // ===== STEP 1: Safety Check =====
  const safety = await runSafetyPipeline(input.message);

  if (safety.requiresEscalation && safety.crisisResponse) {
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

    if (input.conversationId) {
      try {
        await serviceClient.from("messages").insert([
          { conversation_id: input.conversationId, user_id: input.userId, role: "user", content: input.message },
          { conversation_id: input.conversationId, user_id: input.userId, role: "assistant", content: safety.crisisResponse },
        ]);
      } catch { /* non-blocking */ }
    }

    const encoder = new TextEncoder();
    const crisisText = safety.crisisResponse;
    return {
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(crisisText));
          controller.close();
        },
      }),
      metadata: {
        conversationId: input.conversationId || "",
        crisis: true,
        crisisLevel: safety.level,
        emotion: null,
        state: "ESCALATION",
        modelUsed: "rule-based",
        resources: safety.resources,
      },
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

  await serviceClient.from("messages").insert({
    conversation_id: conversationId,
    user_id: input.userId,
    role: "user",
    content: input.message,
  });

  // ===== STEP 4: Load Context (with smart RAG bypass) =====
  const skipMemory = shouldSkipMemory(input.message, emotion);
  const emptyMemory = { shortTerm: [], longTerm: [], episodic: [], emotional: [], formatted: "" };

  const [historyResult, memory, profileResult] = await Promise.all([
    serviceClient
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(30),
    skipMemory ? Promise.resolve(emptyMemory) : getMemoryContext(input.userId, input.message),
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

  // ===== STEP 5: State + Model + Prompt =====
  const state = determineState({
    emotion,
    safety,
    messageCount: conversationHistory.length,
    userMessage: input.message,
  });

  const modelConfig = selectModel({ emotion, safety, state, messageLength: input.message.length });

  const ctx: PipelineContext = {
    input,
    user,
    safety,
    emotion,
    memory,
    state,
    conversationHistory: conversationHistory.slice(0, -1),
    conversationId,
    modelConfig,
  };

  const promptMessages = buildPrompt(ctx);

  // ===== STEP 6: Stream LLM + collect for post-processing =====
  const { stream: llmStream, model } = await callLLMStreaming(promptMessages, modelConfig);

  let fullResponse = "";
  const encoder = new TextEncoder();

  const transformedStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = llmStream.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value, { stream: true });
          fullResponse += text;
          controller.enqueue(encoder.encode(text));
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      } finally {
        // Post-stream: save response + background tasks
        const validated = validateResponse(fullResponse, {
          crisisMode: safety.level !== "safe",
          emotionIntensity: emotion.intensity,
        });

        Promise.resolve(
          serviceClient.from("messages").insert({
            conversation_id: conversationId,
            user_id: input.userId,
            role: "assistant",
            content: validated.content,
            emotion_data: emotion,
          })
        ).catch(() => {});

        Promise.resolve(
          serviceClient.from("conversations").update({
            updated_at: new Date().toISOString(),
            message_count: conversationHistory.length + 2,
            emotional_state: emotion.primaryEmotion,
          }).eq("id", conversationId)
        ).catch(() => {});

        if (!skipMemory) {
          storeMemory({
            userId: input.userId,
            content: `User: "${input.message.slice(0, 200)}". State: ${state}. Emotion: ${emotion.primaryEmotion} (${emotion.intensity}/10).`,
            memoryType: "conversation",
            importance: emotion.intensity > 6 ? 0.8 : 0.5,
            metadata: { conversation_id: conversationId, state },
          }).catch(() => {});
        }

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

        if (conversationHistory.length % 50 === 0) {
          compressMemories(input.userId).catch(() => {});
        }
      }
    },
  });

  return {
    stream: transformedStream,
    metadata: {
      conversationId,
      crisis: false,
      emotion,
      state,
      modelUsed: model,
    },
  };
}
