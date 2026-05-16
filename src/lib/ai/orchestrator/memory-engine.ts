/**
 * Memory Engine — Multi-Tier Memory with Conversation Summarization
 * 
 * Short-Term: Recent messages (in-context)
 * Long-Term: Semantic summaries (pgvector)
 * Episodic: Important events (pgvector)
 * Emotional: Mood evolution (pgvector)
 */

import { createServiceRoleClient } from "@/lib/supabase/server";
import { generateEmbedding } from "@/lib/ai/openai";
import { classifyWithLLM } from "./router";
import type { MemoryContext } from "./types";

/**
 * Get multi-tier memory context for a user
 */
export async function getMemoryContext(
  userId: string,
  currentMessage: string
): Promise<MemoryContext> {
  const empty: MemoryContext = {
    shortTerm: [],
    longTerm: [],
    episodic: [],
    emotional: [],
    formatted: "",
  };

  try {
    const supabase = await createServiceRoleClient();
    const queryEmbedding = await generateEmbedding(currentMessage);

    // Semantic search for relevant memories
    const { data: memories } = await supabase.rpc("match_memories", {
      query_embedding: JSON.stringify(queryEmbedding),
      match_threshold: 0.65,
      match_count: 8,
      p_user_id: userId,
    });

    if (!memories || memories.length === 0) return empty;

    // Categorize memories
    const longTerm: string[] = [];
    const episodic: string[] = [];
    const emotional: string[] = [];

    for (const mem of memories) {
      const date = new Date(mem.created_at).toLocaleDateString();
      const entry = `[${date}] ${mem.content}`;

      switch (mem.memory_type) {
        case "conversation":
        case "insight":
          longTerm.push(entry);
          break;
        case "journal":
        case "preference":
          episodic.push(entry);
          break;
        case "mood":
          emotional.push(entry);
          break;
        default:
          longTerm.push(entry);
      }
    }

    // Format for prompt injection
    const parts: string[] = [];
    if (longTerm.length > 0) {
      parts.push(`**Past conversations:**\n${longTerm.slice(0, 3).join("\n")}`);
    }
    if (episodic.length > 0) {
      parts.push(`**Important events:**\n${episodic.slice(0, 2).join("\n")}`);
    }
    if (emotional.length > 0) {
      parts.push(`**Mood history:**\n${emotional.slice(0, 2).join("\n")}`);
    }

    return {
      shortTerm: [],
      longTerm,
      episodic,
      emotional,
      formatted: parts.length > 0 ? parts.join("\n\n") : "",
    };
  } catch (e) {
    console.error("Memory engine error:", e);
    return empty;
  }
}

/**
 * Store a memory with importance scoring
 */
export async function storeMemory(params: {
  userId: string;
  content: string;
  memoryType: string;
  importance?: number;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const supabase = await createServiceRoleClient();
    const embedding = await generateEmbedding(params.content);

    await supabase.from("memories").insert({
      user_id: params.userId,
      content: params.content,
      memory_type: params.memoryType,
      metadata: { ...(params.metadata || {}), importance: params.importance || 0.5 },
      embedding: JSON.stringify(embedding),
    });
  } catch (e) {
    console.error("Memory store error:", e);
  }
}

/**
 * Summarize a conversation (called after every 20 messages)
 */
export async function summarizeConversation(
  messages: Array<{ role: string; content: string }>
): Promise<{
  summary: string;
  keyEvents: string[];
  emotionalArc: string;
  userTraits: string[];
}> {
  const transcript = messages
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  const raw = await classifyWithLLM(
    `You are analyzing a therapy conversation. Return ONLY valid JSON:
{
  "summary": "2-3 sentence emotional summary",
  "keyEvents": ["event1", "event2"],
  "emotionalArc": "brief description of how emotions changed",
  "userTraits": ["trait1", "trait2"]
}`,
    transcript.slice(0, 3000)
  );

  try {
    return JSON.parse(raw);
  } catch {
    return {
      summary: "Conversation about user wellbeing.",
      keyEvents: [],
      emotionalArc: "unknown",
      userTraits: [],
    };
  }
}

/**
 * Compress old memories when count exceeds threshold
 * Called periodically to keep memory storage efficient
 */
export async function compressMemories(userId: string): Promise<void> {
  const supabase = await createServiceRoleClient();

  // Count memories
  const { count } = await supabase
    .from("memories")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  if (!count || count < 50) return;

  // Get oldest conversation memories
  const { data: oldMemories } = await supabase
    .from("memories")
    .select("id, content, created_at")
    .eq("user_id", userId)
    .eq("memory_type", "conversation")
    .order("created_at", { ascending: true })
    .limit(20);

  if (!oldMemories || oldMemories.length < 10) return;

  // Summarize old memories into one compressed memory
  const combined = oldMemories.map((m) => m.content).join("\n");
  const summary = await classifyWithLLM(
    "Compress these conversation notes into a concise 3-sentence summary that captures the most important emotional themes and events. Return only the summary text.",
    combined.slice(0, 3000)
  );

  // Store compressed summary
  await storeMemory({
    userId,
    content: `[Compressed Summary] ${summary}`,
    memoryType: "insight",
    importance: 0.9,
    metadata: { compressed: true, originalCount: oldMemories.length },
  });

  // Delete old individual memories
  const idsToDelete = oldMemories.map((m) => m.id);
  await supabase.from("memories").delete().in("id", idsToDelete);
}
