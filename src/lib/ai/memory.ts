/**
 * AI Memory System
 * Handles short-term, long-term, and semantic memory for conversation continuity
 */

import { createServiceRoleClient } from "@/lib/supabase/server";
import { generateEmbedding } from "@/lib/ai/openai";

export interface MemoryEntry {
  id: string;
  user_id: string;
  content: string;
  memory_type: "conversation" | "insight" | "preference" | "mood" | "journal";
  metadata: Record<string, unknown>;
  embedding?: number[];
  created_at: string;
}

/**
 * Store a new memory with its embedding
 */
export async function storeMemory(params: {
  userId: string;
  content: string;
  memoryType: MemoryEntry["memory_type"];
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const supabase = await createServiceRoleClient();
  const embedding = await generateEmbedding(params.content);

  await supabase.from("memories").insert({
    user_id: params.userId,
    content: params.content,
    memory_type: params.memoryType,
    metadata: params.metadata || {},
    embedding: JSON.stringify(embedding),
  });
}

/**
 * Retrieve relevant memories using semantic similarity
 */
export async function retrieveMemories(params: {
  userId: string;
  query: string;
  limit?: number;
  memoryTypes?: MemoryEntry["memory_type"][];
}): Promise<MemoryEntry[]> {
  const supabase = await createServiceRoleClient();
  const queryEmbedding = await generateEmbedding(params.query);

  // Use Supabase's pgvector similarity search
  const { data, error } = await supabase.rpc("match_memories", {
    query_embedding: JSON.stringify(queryEmbedding),
    match_threshold: 0.7,
    match_count: params.limit || 5,
    p_user_id: params.userId,
  });

  if (error) {
    console.error("Memory retrieval error:", error);
    return [];
  }

  return data || [];
}

/**
 * Store a conversation summary as a memory
 */
export async function storeConversationSummary(params: {
  userId: string;
  conversationId: string;
  summary: string;
  emotionalState: string;
  topics: string[];
}): Promise<void> {
  await storeMemory({
    userId: params.userId,
    content: params.summary,
    memoryType: "conversation",
    metadata: {
      conversation_id: params.conversationId,
      emotional_state: params.emotionalState,
      topics: params.topics,
    },
  });
}

/**
 * Get formatted memory context for prompt injection
 */
export async function getMemoryContext(
  userId: string,
  currentMessage: string
): Promise<string> {
  const memories = await retrieveMemories({
    userId,
    query: currentMessage,
    limit: 5,
  });

  if (memories.length === 0) return "";

  const contextParts = memories.map((m, i) => {
    const date = new Date(m.created_at).toLocaleDateString();
    return `[${date}] ${m.content}`;
  });

  return `Previous relevant context:\n${contextParts.join("\n")}`;
}
