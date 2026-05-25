/**
 * AI Orchestrator — The Brain of MenAI Life Operating System
 * 
 * Pipeline:
 * 1. Safety Engine        → Crisis detection + moderation
 * 2. Emotion Engine       → Emotional analysis
 * 3. Extraction Engine    → Extract goals/commitments/relationships (parallel)
 * 4. State Machine        → Determine conversation mode
 * 5. Memory Engine        → Retrieve relevant context (vector)
 * 6. Accountability Engine → Retrieve life context (structured)
 * 7. LLM Router           → Select optimal model
 * 8. Prompt Builder        → Construct dynamic prompt
 * 9. LLM Call              → Generate response
 * 10. Response Validator   → Output safety check
 * 11. Memory Storage       → Store for future context
 * 12. Data Persistence     → Persist extracted life data
 */

import { createServiceRoleClient } from "@/lib/supabase/server";
import { runSafetyPipeline } from "./safety-engine";
import { detectEmotion } from "./emotion-engine";
import { determineState, classifyIntent } from "./state-machine";
import { getMemoryContext, storeMemory, summarizeConversation, compressMemories } from "./memory-engine";
import { selectModel, callLLM, callLLMStreaming } from "./router";
import { buildPrompt } from "./prompt-builder";
import { validateResponse } from "./response-validator";
import { extractLifeData, persistExtractedData, hasExtractedData } from "./extraction-engine";
import { getLifeContext } from "./accountability-engine";
import type { OrchestratorInput, OrchestratorOutput, PipelineContext, UserProfile, EmotionAnalysis, LifeContext, ContextRichness } from "./types";

// ===== GRACEFUL FALLBACK RESPONSES =====
// These are used when ANY part of the pipeline fails.
// The user should NEVER see internal errors.
const GRACEFUL_FALLBACKS = [
  "That sounds like something worth exploring deeper. What's been on your mind about this?",
  "I want to make sure I understand what you're saying. Could you tell me a bit more about what's driving this?",
  "There's something important in what you just shared. Let's unpack it — what does this mean for you right now?",
  "I'm here and listening. What's the most important thing you want to talk through right now?",
  "That's worth sitting with for a moment. What part of this feels most urgent to you?",
];

function getGracefulFallback(userMessage: string): string {
  // Try to create a contextual fallback based on the user's message
  const lower = userMessage.toLowerCase().trim();

  // Detect common intents even in fallback mode
  if (/plan my (day|week)/i.test(lower)) {
    return "I'd love to help you plan. What are the main things you want to move forward today?";
  }
  if (/i (want|need) to (build|create|start|launch)/i.test(lower)) {
    return `That sounds like something that's been sitting seriously on your mind lately. Are you still exploring ideas right now, or do you already have something specific you want to build?`;
  }
  if (/i('m| am) (stuck|lost|confused)/i.test(lower)) {
    return "Being stuck is frustrating, but it usually means you're at the edge of something new. What's the thing that feels most unclear right now?";
  }
  if (/i('m| am) (tired|exhausted|burned out|drained)/i.test(lower)) {
    return "That kind of tiredness isn't just physical — your mind and heart are both carrying weight right now. What's been draining you the most?";
  }

  // Generic but warm fallback
  return GRACEFUL_FALLBACKS[Math.floor(Math.random() * GRACEFUL_FALLBACKS.length)];
}

/**
 * Compute how much structured context we have about this user.
 * Prevents hallucinated plans when we don't know their goals.
 */
function computeContextRichness(lifeContext: LifeContext | null): ContextRichness {
  if (!lifeContext) {
    return { score: 0, level: "LOW", hasGoals: false, hasCommitments: false, hasTasks: false, hasRelationships: false };
  }

  const hasGoals = (lifeContext.activeGoals?.length || 0) > 0;
  const hasCommitments = (lifeContext.activeCommitments?.length || 0) > 0;
  const hasTasks = (lifeContext.pendingTasks?.length || 0) > 0;
  const hasRelationships = (lifeContext.recentRelationships?.length || 0) > 0;

  let score = 0;
  if (hasGoals) score += 0.35;
  if (hasCommitments) score += 0.25;
  if (hasTasks) score += 0.25;
  if (hasRelationships) score += 0.15;

  const level = score >= 0.7 ? "HIGH" : score >= 0.3 ? "MODERATE" : "LOW";

  return { score, level, hasGoals, hasCommitments, hasTasks, hasRelationships };
}

/**
 * Main orchestrator — process a user message through the full pipeline
 * Wrapped in graceful error handling — users NEVER see internal errors.
 */
export async function orchestrate(input: OrchestratorInput): Promise<OrchestratorOutput> {
  try {
    return await _orchestrateInternal(input);
  } catch (error) {
    console.error("Orchestrator top-level failure:", error);
    // Return a graceful fallback instead of crashing
    return {
      response: getGracefulFallback(input.message),
      conversationId: input.conversationId || "",
      crisis: false,
      emotion: null,
      state: "LISTENING",
      modelUsed: "fallback",
      tokensUsed: 0,
    };
  }
}

async function _orchestrateInternal(input: OrchestratorInput): Promise<OrchestratorOutput> {
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

  // ===== STEP 4a: Classify Intent (fast, no LLM) =====
  const intent = classifyIntent(input.message);

  // ===== STEP 4b: Load Context (parallel: history, memory, profile, life context, extraction) =====
  const skipMemory = shouldSkipMemory(input.message, emotion);
  const emptyMemory = { shortTerm: [] as string[], longTerm: [] as string[], episodic: [] as string[], emotional: [] as string[], formatted: "" };

  const [historyResult, memory, profileResult, lifeContext, extractedData] = await Promise.all([
    serviceClient
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(30),
    skipMemory ? Promise.resolve(emptyMemory) : getMemoryContext(input.userId, input.message),
    serviceClient
      .from("profiles")
      .select("full_name, therapy_goals, vision, founder_mode, coaching_style")
      .eq("id", input.userId)
      .single(),
    getLifeContext(input.userId).catch(() => null),
    extractLifeData(input.message).catch(() => ({ goals: [], commitments: [], relationships: [], habits: [], emotions: [], projects: [], blockers: [] })),
  ]);

  const conversationHistory = (historyResult.data || []).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const user: UserProfile = {
    id: input.userId,
    fullName: profileResult.data?.full_name || undefined,
    vision: profileResult.data?.vision || undefined,
    founderMode: profileResult.data?.founder_mode || false,
    coachingStyle: profileResult.data?.coaching_style || "balanced",
    sessionCount: conversationHistory.length,
  };

  // ===== STEP 4c: Compute Context Richness =====
  const contextRichness = computeContextRichness(lifeContext);

  // ===== STEP 5: Determine Conversation State (intent-aware + context-aware) =====
  const hasAccountability = (lifeContext?.accountabilityItems?.length || 0) > 0;
  const state = determineState({
    emotion,
    safety,
    messageCount: conversationHistory.length,
    userMessage: input.message,
    hasAccountabilityItems: hasAccountability,
    intent,
    contextRichness,
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
    lifeContext: lifeContext || undefined,
    state,
    intent,
    contextRichness,
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

  // Persist extracted life data
  if (hasExtractedData(extractedData)) {
    persistExtractedData(input.userId, extractedData, conversationId, serviceClient).catch(() => {});

    // Store extraction as memory too (for vector recall)
    const extractionSummary = buildExtractionSummary(extractedData);
    if (extractionSummary) {
      storeMemory({
        userId: input.userId,
        content: extractionSummary,
        memoryType: extractedData.goals.length > 0 ? "goal" : "commitment",
        importance: 0.85,
        metadata: { conversation_id: conversationId, type: "extraction" },
      }).catch(() => {});
    }
  }

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
    extractedData: hasExtractedData(extractedData) ? extractedData : undefined,
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
 * Build a summary string from extracted data for memory storage
 */
function buildExtractionSummary(data: import("./types").ExtractedLifeData): string {
  const parts: string[] = [];
  if (data.goals.length > 0) {
    parts.push(`Goals mentioned: ${data.goals.map((g) => g.title).join(", ")}`);
  }
  if (data.commitments.length > 0) {
    parts.push(`Commitments made: ${data.commitments.map((c) => c.description).join(", ")}`);
  }
  if (data.projects.length > 0) {
    parts.push(`Projects discussed: ${data.projects.map((p) => `${p.name} (${p.status})`).join(", ")}`);
  }
  if (data.relationships.length > 0) {
    parts.push(`People mentioned: ${data.relationships.map((r) => `${r.name} (${r.role})`).join(", ")}`);
  }
  if (data.blockers.length > 0) {
    parts.push(`Blockers identified: ${data.blockers.join(", ")}`);
  }
  return parts.join(". ");
}

/**
 * Streaming orchestrator — runs the full pipeline but streams the LLM response.
 * Returns metadata + a ReadableStream for progressive rendering.
 * Wrapped in graceful error handling.
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
  try {
    return await _orchestrateStreamingInternal(input);
  } catch (error) {
    console.error("Streaming orchestrator top-level failure:", error);
    // Return a graceful streamed fallback
    const encoder = new TextEncoder();
    const fallbackText = getGracefulFallback(input.message);
    return {
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(fallbackText));
          controller.close();
        },
      }),
      metadata: {
        conversationId: input.conversationId || "",
        crisis: false,
        emotion: null,
        state: "LISTENING",
        modelUsed: "fallback",
      },
    };
  }
}

async function _orchestrateStreamingInternal(input: OrchestratorInput): Promise<{
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

  // ===== STEP 4a: Classify Intent =====
  const intent = classifyIntent(input.message);

  // ===== STEP 4b: Load Context (parallel) =====
  const skipMemory = shouldSkipMemory(input.message, emotion);
  const emptyMemory = { shortTerm: [], longTerm: [], episodic: [], emotional: [], formatted: "" };

  const [historyResult, memory, profileResult, lifeContext, extractedData] = await Promise.all([
    serviceClient
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(30),
    skipMemory ? Promise.resolve(emptyMemory) : getMemoryContext(input.userId, input.message),
    serviceClient
      .from("profiles")
      .select("full_name, therapy_goals, vision, founder_mode, coaching_style")
      .eq("id", input.userId)
      .single(),
    getLifeContext(input.userId).catch(() => null),
    extractLifeData(input.message).catch(() => ({ goals: [], commitments: [], relationships: [], habits: [], emotions: [], projects: [], blockers: [] })),
  ]);

  const conversationHistory = (historyResult.data || []).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const user: UserProfile = {
    id: input.userId,
    fullName: profileResult.data?.full_name || undefined,
    vision: profileResult.data?.vision || undefined,
    founderMode: profileResult.data?.founder_mode || false,
    coachingStyle: profileResult.data?.coaching_style || "balanced",
    sessionCount: conversationHistory.length,
  };

  // ===== STEP 4c: Compute Context Richness =====
  const contextRichness = computeContextRichness(lifeContext);

  // ===== STEP 5: State + Model + Prompt =====
  const hasAccountability = (lifeContext?.accountabilityItems?.length || 0) > 0;
  const state = determineState({
    emotion,
    safety,
    messageCount: conversationHistory.length,
    userMessage: input.message,
    hasAccountabilityItems: hasAccountability,
    intent,
    contextRichness,
  });

  const modelConfig = selectModel({ emotion, safety, state, messageLength: input.message.length });

  const ctx: PipelineContext = {
    input,
    user,
    safety,
    emotion,
    memory,
    lifeContext: lifeContext || undefined,
    state,
    intent,
    contextRichness,
    conversationHistory: conversationHistory.slice(0, -1),
    conversationId,
    modelConfig,
  };

  const promptMessages = buildPrompt(ctx);

  // ===== STEP 6: Stream LLM + collect for post-processing =====
  const { stream: llmStream, model } = await callLLMStreaming(promptMessages, modelConfig, emotion, state);

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

        // Persist extracted data
        if (hasExtractedData(extractedData)) {
          persistExtractedData(input.userId, extractedData, conversationId, serviceClient).catch(() => {});
          const extractionSummary = buildExtractionSummary(extractedData);
          if (extractionSummary) {
            storeMemory({
              userId: input.userId,
              content: extractionSummary,
              memoryType: extractedData.goals.length > 0 ? "goal" : "commitment",
              importance: 0.85,
              metadata: { conversation_id: conversationId, type: "extraction" },
            }).catch(() => {});
          }
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
