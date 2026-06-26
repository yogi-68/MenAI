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

import { COACH_CHAT_MODEL, FAST_MODEL } from "@/lib/ai/models";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { logAiUsage } from "@/lib/ai/usage-guard";
import { runCrisisSafetyCheck, scheduleAsyncModeration } from "./safety-engine";
import { detectEmotion } from "./emotion-engine";
import { determineState, classifyIntent } from "./state-machine";
import { getMemoryContext, storeMemory, summarizeConversation, compressMemories } from "./memory-engine";
import { selectModel, callLLM, callLLMStreaming } from "./router";
import { buildPrompt } from "./prompt-builder";
import { validateResponse } from "./response-validator";
import { validateResponseStyle } from "./style-validator";
import { scoreClaimQuality } from "@/lib/ai/claim-quality";
import { extractLifeData, persistExtractedData, hasExtractedData } from "./extraction-engine";
import { ingestChatMentorSignal } from "@/lib/mentor/mentor-memory";
import { trackProductEvent } from "@/lib/analytics/track-event";
import { buildRhythmContext, formatRhythmBlockForPrompt } from "@/lib/plans/rhythm-phase";
import { fetchTodayTaskStats } from "@/lib/plans/today-task-stats";
import { getUserContext } from "@/lib/context/user-context";
import { loadTodayPlanBlockForPrompt } from "@/lib/plans/today-plan-context";
import {
  formatMemoryRetrievalForPrompt,
  formatPinnedMemoriesForPrompt,
  loadMemoryRetrievalContext,
  loadPinnedMemories,
} from "@/lib/mentor/memory-retrieval";
import { evaluatePredictions } from "./prediction-engine";
import { buildCognitiveState } from "./cognition-engine";
import { getUserModel } from "@/lib/user-model/loader";
import type { OrchestratorInput, OrchestratorOutput, PipelineContext, UserProfile, EmotionAnalysis } from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";

async function resolveConversationId(
  serviceClient: SupabaseClient,
  userId: string,
  requestedId: string | null | undefined,
  title: string
): Promise<string> {
  let conversationId = requestedId || "";
  if (conversationId) {
    const { data: existingConv } = await serviceClient
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!existingConv) conversationId = "";
  }
  if (!conversationId) {
    const { data: newConv } = await serviceClient
      .from("conversations")
      .insert({ user_id: userId, title: title.slice(0, 50) })
      .select("id")
      .single();
    conversationId = newConv?.id || "";
  }
  return conversationId;
}

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
    return "Let me pull together a focused plan based on what I know about your priorities. Give me a moment to think through what would make today count.";
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

function shouldSampleContextConfidence(styleScore: number): boolean {
  return styleScore < 70 || Math.random() < 0.1;
}

// Removed unused legacy context richness code

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

  // ===== STEP 1: Crisis check (sync — moderation runs after response) =====
  const safety = runCrisisSafetyCheck(input.message);

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
  const conversationId = await resolveConversationId(
    serviceClient,
    input.userId,
    input.conversationId,
    input.message
  );

  // Save user message
  await serviceClient.from("messages").insert({
    conversation_id: conversationId,
    user_id: input.userId,
    role: "user",
    content: input.message,
  });

  // ===== STEP 4a: Classify Intent (fast, no LLM) =====
  const intent = classifyIntent(input.message);
  if (intent.type === "IDENTITY_EXPLORATION" || /\bwho am i\b/i.test(input.message)) {
    trackProductEvent(input.userId, "who_am_i_asked").catch(() => {});
  }

  // ===== STEP 4b: Load Context (parallel: history, memory, profile, life context) =====
  // NOTE: extractLifeData() runs in BACKGROUND after response — not here.
  // This keeps the response path fast (<2-4s target).
  const skipMemory = shouldSkipMemory(input.message, emotion);
  const emptyMemory = { shortTerm: [] as string[], longTerm: [] as string[], episodic: [] as string[], emotional: [] as string[], formatted: "" };

  const [historyResult, memory, profileResult, cognitiveState, initialUserModel] = await Promise.all([
    serviceClient
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(30),
    skipMemory ? Promise.resolve(emptyMemory) : getMemoryContext(input.userId, input.message),
    serviceClient
      .from("profiles")
      .select("full_name, vision")
      .eq("id", input.userId)
      .single(),
    buildCognitiveState(input.userId),
    getUserModel(serviceClient, input.userId),
  ]);

  const mentorSignal = await ingestChatMentorSignal(serviceClient, input.userId, input.message);
  const userModel = mentorSignal.pivoted
    ? await getUserModel(serviceClient, input.userId, { refresh: true })
    : initialUserModel;

  const pinnedMemories = await loadPinnedMemories(serviceClient, input.userId);
  const pinnedBlock = formatPinnedMemoriesForPrompt(pinnedMemories);

  const retrievalCtx = await loadMemoryRetrievalContext(serviceClient, input.userId);
  const memoryRetrievalBlock = [
    pinnedBlock,
    formatMemoryRetrievalForPrompt(retrievalCtx, input.message),
  ]
    .filter(Boolean)
    .join("\n\n");

  const conversationHistory = (historyResult.data || []).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const user: UserProfile = {
    id: input.userId,
    fullName: profileResult.data?.full_name || undefined,
    vision: profileResult.data?.vision || undefined,
    sessionCount: conversationHistory.length,
  };

  // ===== STEP 4c: Compute Context Richness =====
  const contextRichnessLevel = cognitiveState.maturity_level === "deep" ? "HIGH" : cognitiveState.maturity_level === "established" ? "MODERATE" : "LOW";

  // ===== STEP 5: Determine Conversation State (intent-aware + context-aware) =====
  const hasAccountability = cognitiveState.unfinished_commitments.length > 0;
  const state = determineState({
    emotion,
    safety,
    messageCount: conversationHistory.length,
    userMessage: input.message,
    hasAccountabilityItems: hasAccountability,
    intent,
    contextRichness: { level: contextRichnessLevel, score: 0, hasGoals: false, hasCommitments: false, hasTasks: false, hasRelationships: false }, // Legacy compatibility
  });

  // ===== STEP 6: Select Model =====
  const modelConfig = selectModel({
    emotion,
    safety,
    state,
    messageLength: input.message.length,
  });
  modelConfig.model = COACH_CHAT_MODEL;

  // ===== STEP 7: Build Pipeline Context =====

  // Session Context Injection - Log for observability
  if (process.env.NODE_ENV !== "production") {
    console.log("[Session Context]", {
      userId: input.userId,
      conversationId,
      memoryCount: memory.longTerm.length + memory.episodic.length + memory.emotional.length,
      maturityLevel: cognitiveState.maturity_level,
    });
  }

  const [taskStats, userContext] = await Promise.all([
    fetchTodayTaskStats(serviceClient, input.userId),
    getUserContext(serviceClient, input.userId),
  ]);
  const rhythmCtx = buildRhythmContext(taskStats);
  const rhythmBlock = formatRhythmBlockForPrompt(rhythmCtx, taskStats);
  const todayPlanBlock = await loadTodayPlanBlockForPrompt(
    serviceClient,
    input.userId,
    userContext
  );

  const ctx: PipelineContext = {
    input,
    user,
    safety,
    emotion,
    memory,
    cognitiveState,
    userModel,
    state,
    intent,
    conversationHistory: conversationHistory.slice(0, -1),
    conversationId,
    modelConfig,
    memoryRetrievalBlock,
    rhythmBlock,
    todayPlanBlock,
  };

  // ===== STEP 8: Build Prompt & Call LLM =====
  const promptMessages = buildPrompt(ctx);
  let llmResult = await callLLM(promptMessages, modelConfig);

  // ===== STEP 9: Validate Response =====
  const validated = validateResponse(llmResult.content, {
    crisisMode: safety.level !== "safe",
    emotionIntensity: emotion.intensity,
  });

  if (validated.flags.length > 0) {
    console.warn("Response validation flags:", validated.flags);
  }

  // ===== STEP 9b: Style Validation with Regeneration =====
  const styleValidation = validateResponseStyle(validated.content, {
    lifeContext: null, // Legacy, replace later if needed
    contextRichness: { level: contextRichnessLevel, score: 0, hasGoals: false, hasCommitments: false, hasTasks: false, hasRelationships: false },
    userMessage: input.message,
  });

  // If style validation fails badly, regenerate with feedback
  if (styleValidation.shouldRegenerate && styleValidation.feedback) {
    console.warn("Style validation failed, regenerating:", {
      score: styleValidation.score,
      violations: styleValidation.violations,
    });

    // Add regeneration instructions to the prompt
    const regenerationMessages = [
      ...promptMessages,
      { role: "assistant" as const, content: validated.content },
      { role: "user" as const, content: styleValidation.feedback },
    ];

    // Regenerate
    llmResult = await callLLM(regenerationMessages, modelConfig);
    
    // Validate again (no second regeneration to avoid loops)
    const revalidated = validateResponse(llmResult.content, {
      crisisMode: safety.level !== "safe",
      emotionIntensity: emotion.intensity,
    });
    
    llmResult.content = revalidated.content;
  }

  // Log context confidence (sampled — always when style score is low)
  if (shouldSampleContextConfidence(styleValidation.score)) {
    try {
      await serviceClient.from("context_confidence_log").insert({
        user_id: input.userId,
        conversation_id: conversationId,
        richness_level: contextRichnessLevel,
        goals_count: cognitiveState.active_goals.length,
        tasks_count: 0,
        commitments_count: cognitiveState.unfinished_commitments.length,
        sufficient_for_planning: styleValidation.score >= 70,
      });
    } catch {
      // Non-critical logging — silently ignore
    }
  }

  scheduleAsyncModeration(input.message);

  // ===== STEP 10: Save AI Response =====
  await serviceClient.from("messages").insert({
    conversation_id: conversationId,
    user_id: input.userId,
    role: "assistant",
    content: llmResult.content,
    emotion_data: emotion,
    token_count: llmResult.tokensUsed,
  });

  logAiUsage(
    input.userId,
    "chat",
    llmResult.model || FAST_MODEL,
    Math.round(llmResult.tokensUsed * 0.6),
    Math.round(llmResult.tokensUsed * 0.4),
    { metadata: { claimQuality: scoreClaimQuality(validated.content, ctx.userModel) } }
  ).catch(() => {});

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
  // These all run AFTER the response is returned to the user.

  // Extract life data from message (moved from fast path to background)
  const extractedData = extractLifeData(input.message).catch(() => ({ goals: [], commitments: [], relationships: [], habits: [], emotions: [], projects: [], opportunities: [], blockers: [], identitySignals: [], executionPatterns: [] }));

  // Store memory
  storeMemory({
    userId: input.userId,
    content: `User: "${input.message.slice(0, 200)}". State: ${state}. Emotion: ${emotion.primaryEmotion} (${emotion.intensity}/10).`,
    memoryType: "conversation",
    importance: emotion.intensity > 6 ? 0.8 : 0.5,
    metadata: { conversation_id: conversationId, state },
  }).catch(() => {});

  // Mentor memory + weakness tracking runs before prompt — pivot must apply before retrieval

  // Persist extracted life data (after extraction completes)
  extractedData.then((data) => {
    if (hasExtractedData(data)) {
      persistExtractedData(input.userId, data, conversationId, serviceClient).then(() => {
        // After successful persistence, we no longer need to invalidate old snapshot
        console.log("[Extraction] Successfully persisted data");
      }).catch(() => {});
      
      const extractionSummary = buildExtractionSummary(data);
      if (extractionSummary) {
        storeMemory({
          userId: input.userId,
          content: extractionSummary,
          memoryType: data.goals.length > 0 ? "goal" : "commitment",
          importance: 0.85,
          metadata: { conversation_id: conversationId, type: "extraction" },
        }).catch(() => { /* non-critical */ });
      }
      
      // Evaluate predictions in background
      evaluatePredictions({
        userId: input.userId,
        extractedData: data,
        conversationId,
        serviceClient,
      }).catch(() => {});
    }
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
  
  // Detect and record behavioral patterns (every 10 messages)
  if (conversationHistory.length > 0 && conversationHistory.length % 10 === 0) {
    import("./pattern-detector").then(({ detectAndRecordPatterns }) => {
      detectAndRecordPatterns(input.userId).catch(() => {
        // Non-critical - pattern detection failure shouldn't break the app
      });
    }).catch(() => {});
  }

  // Compress old memories periodically
  if (conversationHistory.length % 50 === 0) {
    compressMemories(input.userId).catch(() => {});
  }

  return {
    response: llmResult.content,
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
  const pipelineStart = Date.now();

  // ===== STEP 1: Crisis check (sync — moderation runs after stream starts) =====
  const safety = runCrisisSafetyCheck(input.message);

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

  // ===== STEP 2–3: Emotion + Conversation (parallel) =====
  const [emotion, conversationId] = await Promise.all([
    detectEmotion(input.message),
    resolveConversationId(serviceClient, input.userId, input.conversationId, input.message),
  ]);

  await serviceClient.from("messages").insert({
    conversation_id: conversationId,
    user_id: input.userId,
    role: "user",
    content: input.message,
  });

  // ===== STEP 4a: Classify Intent =====
  const intent = classifyIntent(input.message);
  if (intent.type === "IDENTITY_EXPLORATION" || /\bwho am i\b/i.test(input.message)) {
    trackProductEvent(input.userId, "who_am_i_asked").catch(() => {});
  }

  // ===== STEP 4b: Load Context (parallel — extraction runs in BACKGROUND) =====
  const skipMemory = shouldSkipMemory(input.message, emotion);
  const emptyMemory = { shortTerm: [], longTerm: [], episodic: [], emotional: [], formatted: "" };

  const [historyResult, memory, profileResult, cognitiveState, initialUserModel] = await Promise.all([
    serviceClient
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(30),
    skipMemory ? Promise.resolve(emptyMemory) : getMemoryContext(input.userId, input.message),
    serviceClient
      .from("profiles")
      .select("full_name, vision")
      .eq("id", input.userId)
      .single(),
    buildCognitiveState(input.userId),
    getUserModel(serviceClient, input.userId),
  ]);

  const mentorSignal = await ingestChatMentorSignal(serviceClient, input.userId, input.message);
  const userModel = mentorSignal.pivoted
    ? await getUserModel(serviceClient, input.userId, { refresh: true })
    : initialUserModel;

  const pinnedMemories = await loadPinnedMemories(serviceClient, input.userId);
  const pinnedBlock = formatPinnedMemoriesForPrompt(pinnedMemories);

  const retrievalCtx = await loadMemoryRetrievalContext(serviceClient, input.userId);
  const memoryRetrievalBlock = [
    pinnedBlock,
    formatMemoryRetrievalForPrompt(retrievalCtx, input.message),
  ]
    .filter(Boolean)
    .join("\n\n");

  const conversationHistory = (historyResult.data || []).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const user: UserProfile = {
    id: input.userId,
    fullName: profileResult.data?.full_name || undefined,
    vision: profileResult.data?.vision || undefined,
    sessionCount: conversationHistory.length,
  };

  // ===== STEP 4c: Compute Context Richness =====
  const contextRichnessLevel = cognitiveState.maturity_level === "deep" ? "HIGH" : cognitiveState.maturity_level === "established" ? "MODERATE" : "LOW";

  // ===== STEP 5: State + Model + Prompt =====
  const hasAccountability = cognitiveState.unfinished_commitments.length > 0;
  const state = determineState({
    emotion,
    safety,
    messageCount: conversationHistory.length,
    userMessage: input.message,
    hasAccountabilityItems: hasAccountability,
    intent,
    contextRichness: { level: contextRichnessLevel, score: 0, hasGoals: false, hasCommitments: false, hasTasks: false, hasRelationships: false }, // Legacy compatibility
  });

  const modelConfig = selectModel({ emotion, safety, state, messageLength: input.message.length });
  modelConfig.model = COACH_CHAT_MODEL;

  // Session Context Injection - Log for observability (streaming path)
  if (process.env.NODE_ENV !== "production") {
    console.log("[Session Context] Streaming", {
      userId: input.userId,
      conversationId,
      memoryCount: memory.longTerm.length + memory.episodic.length + memory.emotional.length,
      maturityLevel: cognitiveState.maturity_level,
    });
  }

  const [taskStats, userContext] = await Promise.all([
    fetchTodayTaskStats(serviceClient, input.userId),
    getUserContext(serviceClient, input.userId),
  ]);
  const rhythmCtx = buildRhythmContext(taskStats);
  const rhythmBlock = formatRhythmBlockForPrompt(rhythmCtx, taskStats);
  const todayPlanBlock = await loadTodayPlanBlockForPrompt(
    serviceClient,
    input.userId,
    userContext
  );

  const ctx: PipelineContext = {
    input,
    user,
    safety,
    emotion,
    memory,
    cognitiveState,
    userModel,
    state,
    intent,
    conversationHistory: conversationHistory.slice(0, -1),
    conversationId,
    modelConfig,
    memoryRetrievalBlock,
    rhythmBlock,
    todayPlanBlock,
  };

  const promptMessages = buildPrompt(ctx);

  // ===== STEP 6: Stream LLM + collect for post-processing =====
  const { stream: llmStream, model } = await callLLMStreaming(promptMessages, modelConfig, emotion, state);
  scheduleAsyncModeration(input.message);

  let fullResponse = "";
  const encoder = new TextEncoder();
  let firstTokenAt: number | null = null;
  let streamErrored = false;

  const transformedStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = llmStream.getReader();
      const decoder = new TextDecoder();
      let validated: ReturnType<typeof validateResponse> | null = null;
      let styleValidation: ReturnType<typeof validateResponseStyle> | null = null;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value, { stream: true });
          if (text && firstTokenAt === null) firstTokenAt = Date.now();
          fullResponse += text;
          controller.enqueue(encoder.encode(text));
        }

        // Validate content synchronously before writing
        validated = validateResponse(fullResponse, {
          crisisMode: safety.level !== "safe",
          emotionIntensity: emotion.intensity,
        });

        styleValidation = validateResponseStyle(validated.content, {
          lifeContext: null,
          contextRichness: { level: contextRichnessLevel, score: 0, hasGoals: false, hasCommitments: false, hasTasks: false, hasRelationships: false },
          userMessage: input.message,
        });

        // Await the DB write so the message ID is available for the sentinel
        const { data: savedMsg } = await serviceClient
          .from("messages")
          .insert({
            conversation_id: conversationId,
            user_id: input.userId,
            role: "assistant",
            content: validated.content,
            emotion_data: emotion,
          })
          .select("id")
          .single();

        // Check if a confidence question should be shown this session (max 1 per session)
        let confidenceQuestion: { factor: string; goalId: string; goalTitle: string } | null = null;
        if (!input.sessionConfidenceAsked) {
          const lowGoal = Object.entries(userModel.goalConfidence ?? {})
            .filter(([, b]) => b.total < 60 && (b.missingFactors?.length ?? 0) > 0)
            .sort(([, a], [, b]) => a.total - b.total)[0];
          if (lowGoal) {
            const [goalId, breakdown] = lowGoal;
            const answeredFactors = breakdown.answeredFactors ?? [];
            const nextFactor = breakdown.missingFactors?.find(
              (mf) => !answeredFactors.includes(mf.factor)
            );
            if (nextFactor) {
              const { data: goalRow } = await serviceClient
                .from("goals")
                .select("title")
                .eq("id", goalId)
                .eq("user_id", input.userId)
                .maybeSingle();
              if (goalRow?.title) {
                confidenceQuestion = { factor: nextFactor.factor, goalId, goalTitle: goalRow.title };
              }
            }
          }
        }

        // Append sentinel so client can use the real server message ID (and optional confidence Q)
        if (savedMsg?.id) {
          const sentinelPayload = JSON.stringify({ id: savedMsg.id, cq: confidenceQuestion });
          controller.enqueue(encoder.encode(`\n__DONE__:${sentinelPayload}\n`));
        }
        controller.close();
      } catch (err) {
        streamErrored = true;
        controller.error(err);
      } finally {
        const durationMs = Date.now() - pipelineStart;
        const ttftMs = firstTokenAt !== null ? firstTokenAt - pipelineStart : null;

        if (!styleValidation?.valid && styleValidation) {
          console.warn("Style validation issues detected:", {
            score: styleValidation.score,
            violations: styleValidation.violations,
            conversationId,
          });
        }

        if (styleValidation && shouldSampleContextConfidence(styleValidation.score)) {
          Promise.resolve(
            serviceClient.from("context_confidence_log").insert({
              user_id: input.userId,
              conversation_id: conversationId,
              richness_level: contextRichnessLevel,
              goals_count: cognitiveState.active_goals.length,
              tasks_count: 0,
              commitments_count: cognitiveState.unfinished_commitments.length,
              sufficient_for_planning: styleValidation.score >= 70,
            })
          ).catch(() => {});
        }

        const estTokens = Math.ceil(fullResponse.length / 4);
        logAiUsage(
          input.userId,
          "chat",
          model,
          Math.round(estTokens * 0.6),
          Math.round(estTokens * 0.4),
          {
            ttftMs,
            durationMs: streamErrored || !fullResponse ? null : durationMs,
            metadata: { claimQuality: validated ? scoreClaimQuality(validated.content, userModel) : 0 },
          }
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

        // Mentor signals already ingested before prompt build

        // Extract and persist life data — awaited so downstream cache+plan invalidation runs reliably
        const bgExtraction = extractLifeData(input.message).catch(() => ({ goals: [], commitments: [], relationships: [], habits: [], emotions: [], projects: [], opportunities: [], blockers: [], identitySignals: [], executionPatterns: [] }));
        bgExtraction.then(async (data) => {
          if (!hasExtractedData(data)) return;

          try {
            await persistExtractedData(input.userId, data, conversationId, serviceClient);
            console.log("[Extraction] Persisted data (streaming)");

            // Step 2: Invalidate user cache immediately
            const { invalidateUserCache: bustCache } = await import("@/lib/ai/orchestrator/cache-invalidation");
            bustCache(input.userId, "extraction complete");

            // Step 3: Delete today's daily_plan so plan regenerates on next open
            const today = new Date().toISOString().split("T")[0];
            Promise.resolve(
              serviceClient.from("daily_plans").delete().eq("user_id", input.userId).eq("plan_date", today)
            ).catch(() => {});

            // Step 4: Recompute confidence for any extracted goals (fire-and-forget)
            if (data.goals.length > 0) {
              const { fetchAndComputeGoalConfidence } = await import("@/lib/plans/goal-confidence");
              const { data: extractedGoalRows } = await serviceClient
                .from("goals")
                .select("id, target_date, success_criteria")
                .eq("user_id", input.userId)
                .in("title", data.goals.map((g) => g.title))
                .limit(5);
              if (extractedGoalRows?.length) {
                for (const goalRow of extractedGoalRows) {
                  fetchAndComputeGoalConfidence(serviceClient, input.userId, goalRow.id, {
                    target_date: goalRow.target_date,
                    success_criteria: goalRow.success_criteria,
                  }).catch(() => {});
                }
              }
            }
          } catch (err) {
            console.error("[Extraction] Persistence failed:", err);
          }

          const extractionSummary = buildExtractionSummary(data);
          if (extractionSummary) {
            storeMemory({
              userId: input.userId,
              content: extractionSummary,
              memoryType: data.goals.length > 0 ? "goal" : "commitment",
              importance: 0.85,
              metadata: { conversation_id: conversationId, type: "extraction" },
            }).catch(() => {});
          }

          // Evaluate predictions in background
          evaluatePredictions({
            userId: input.userId,
            extractedData: data,
            conversationId,
            serviceClient,
          }).catch(() => {});
        }).catch(() => {});

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
