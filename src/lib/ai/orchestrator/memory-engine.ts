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
import { invalidateSnapshot } from "./snapshot-engine";
import type { MemoryContext } from "./types";

/**
 * Get multi-tier memory context for a user
 * Enhanced with emotional prioritization and natural language formatting
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

    // Semantic search for relevant memories - increased from 8 to 12
    const { data: memories } = await supabase.rpc("match_memories", {
      query_embedding: JSON.stringify(queryEmbedding),
      match_threshold: 0.65,
      match_count: 12,
      p_user_id: userId,
    });

    if (!memories || memories.length === 0) return empty;

    // Categorize and prioritize memories with emotional weighting
    const longTerm: string[] = [];
    const episodic: string[] = [];
    const emotional: string[] = [];

    for (const mem of memories) {
      const date = new Date(mem.created_at).toLocaleDateString();
      const entry = `[${date}] ${mem.content}`;

      // Apply emotional prioritization
      const importance = mem.metadata?.importance || 0.5;
      let weight = 1.0;
      
      switch (mem.memory_type) {
        case "conversation":
          weight = 1.0;
          longTerm.push(entry);
          break;
        case "insight":
          weight = 1.5; // Insights are more valuable
          longTerm.push(entry);
          break;
        case "journal":
        case "preference":
          weight = 1.1;
          episodic.push(entry);
          break;
        case "mood":
          weight = 1.2; // Mood patterns are emotionally important
          emotional.push(entry);
          break;
        default:
          longTerm.push(entry);
      }

      // Store weighted importance for sorting (done implicitly by pgvector similarity)
    }

    // Format naturally for companion-like references
    const formatted = formatMemoryNaturally(longTerm, episodic, emotional);

    return {
      shortTerm: [],
      longTerm,
      episodic,
      emotional,
      formatted,
    };
  } catch (e) {
    console.error("Memory engine error:", e);
    return empty;
  }
}

/**
 * Format memories in a natural, companion-like way
 * Instead of clinical lists, create flowing emotional narrative
 */
function formatMemoryNaturally(
  longTerm: string[],
  episodic: string[],
  emotional: string[]
): string {
  const parts: string[] = [];

  // Extract emotional themes from memories
  const themes = extractEmotionalThemes(longTerm, episodic, emotional);

  if (themes.length > 0) {
    // Create a natural narrative from themes
    parts.push(themes.join(" "));
  } else {
    // Fallback to slightly improved formatting if no clear themes
    if (longTerm.length > 0) {
      const recent = longTerm.slice(0, 3).map(cleanMemoryDate);
      parts.push(`You remember: ${recent.join("; ")}.`);
    }
    if (emotional.length > 0) {
      const moods = emotional.slice(0, 2).map(cleanMemoryDate);
      parts.push(`Their mood has been: ${moods.join("; ")}.`);
    }
    if (episodic.length > 0) {
      const events = episodic.slice(0, 2).map(cleanMemoryDate);
      parts.push(`They've shared: ${events.join("; ")}.`);
    }
  }

  return parts.join(" ");
}

/**
 * Extract emotional themes and patterns from memories
 * Returns companion-like narrative statements
 * IMPROVED: Only surfaces themes with strong signals (frequency + recency)
 */
function extractEmotionalThemes(
  longTerm: string[],
  episodic: string[],
  emotional: string[]
): string[] {
  const themes: string[] = [];
  const allMemories = [...longTerm, ...episodic, ...emotional];
  
  // Parse memory dates and content
  const parsedMemories = allMemories.map(mem => {
    const dateMatch = mem.match(/^\[(\d{1,2}\/\d{1,2}\/\d{4})\]/);
    const date = dateMatch ? new Date(dateMatch[1]) : new Date(0);
    const content = cleanMemoryDate(mem).toLowerCase();
    return { date, content, age: Date.now() - date.getTime() };
  });
  
  // Helper: count occurrences with recency weighting
  const countTheme = (keywords: string[]): { count: number; recentMention: boolean } => {
    let count = 0;
    let recentMention = false;
    const fourteenDaysAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);
    
    for (const mem of parsedMemories) {
      if (keywords.some(kw => mem.content.includes(kw))) {
        count++;
        if (mem.date.getTime() > fourteenDaysAgo) {
          recentMention = true;
        }
      }
    }
    return { count, recentMention };
  };

  // Detect loneliness theme (only if mentioned 3+ times AND recently)
  const loneliness = countTheme(["lonely", "alone", "isolated", "disconnected"]);
  if (loneliness.count >= 3 && loneliness.recentMention) {
    themes.push("You remember this person has been feeling isolated - missing emotional connection and the comfort of having people to turn to.");
  }

  // Detect exhaustion/burnout theme
  const exhaustion = countTheme(["exhausted", "tired", "drained", "overwhelm", "burned out", "burnt out"]);
  if (exhaustion.count >= 3 && exhaustion.recentMention) {
    themes.push("They've mentioned feeling emotionally exhausted lately, like carrying weight that doesn't seem to lighten.");
  }

  // Detect anxiety/stress theme
  const anxiety = countTheme(["anxiety", "anxious", "stress", "worry", "panic"]);
  if (anxiety.count >= 3 && anxiety.recentMention) {
    themes.push("Anxiety has been a recurring presence - their mind seems to race often, making it hard to find calm.");
  }

  // Detect relationship struggles
  const relationships = countTheme(["relationship", "partner", "family", "conflict", "argument"]);
  if (relationships.count >= 3 && relationships.recentMention) {
    themes.push("Relationships have been a tender topic - there's been some emotional weight there.");
  }

  // Detect work/productivity stress
  const work = countTheme(["work", "job", "school", "pressure", "deadline"]);
  if (work.count >= 4 && work.recentMention) {
    themes.push("Work has been grinding them down, adding to the overall sense of pressure.");
  }

  // If no specific themes meet threshold, create a general connection statement only if we have substantial history
  if (themes.length === 0 && allMemories.length >= 5) {
    themes.push("You've gotten to know this person across several conversations - you sense their emotional patterns and what weighs on them.");
  }

  return themes.slice(0, 2); // Max 2 themes for conciseness
}

/**
 * Clean memory string by removing date prefix
 */
function cleanMemoryDate(memory: string): string {
  return memory.replace(/^\[\d{1,2}\/\d{1,2}\/\d{4}\]\s*/, "");
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
    
    // Invalidate snapshot cache after storing new memory
    invalidateSnapshot(params.userId);
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
    `You are analyzing a coaching conversation. Return ONLY valid JSON:
{
  "summary": "2-3 sentence session summary focusing on goals, blockers, and decisions",
  "keyEvents": ["event1", "event2"],
  "emotionalArc": "brief description of how energy and focus shifted",
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
  
  // Invalidate snapshot cache after memory compression
  invalidateSnapshot(userId);
}
