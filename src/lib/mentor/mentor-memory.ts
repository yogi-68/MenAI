import type { SupabaseClient } from "@supabase/supabase-js";
import { effectiveConfidence, runMemoryMaintenance } from "@/lib/mentor/memory-aging";
import { bumpLifeAreaWeight, inferAreaFromText, type LifeAreaKey } from "@/lib/plans/life-area-balancer";
import { recordPatternMention, detectPatternsInText } from "@/lib/mentor/weakness-engine";

export type MentorMemoryType = "belief" | "thought" | "relationship_note" | "self_talk" | "pattern_mention";

export interface MentorMemory {
  memoryType: MentorMemoryType;
  text: string;
  confidence: number;
}

const BELIEF_PATTERNS: Array<{ re: RegExp; type: MentorMemoryType; confidence: number }> = [
  { re: /\bi doubt myself\b/i, type: "belief", confidence: 0.88 },
  { re: /\bi keep researching\b/i, type: "belief", confidence: 0.9 },
  { re: /\bi (tend to|always) overthink\b/i, type: "belief", confidence: 0.92 },
  { re: /\bi work too much\b/i, type: "self_talk", confidence: 0.85 },
  { re: /\bmy (girlfriend|boyfriend|partner|wife|husband) thinks i overthink\b/i, type: "relationship_note", confidence: 0.87 },
  { re: /\bi('m| am) (scared|afraid|worried) (of|about|that)\b/i, type: "thought", confidence: 0.8 },
  { re: /\bi never finish\b/i, type: "belief", confidence: 0.85 },
  { re: /\bi('m| am) (also )?(into|interested in)\s+(\w+)/i, type: "thought", confidence: 0.82 },
];

export function extractMentorMemoriesFromText(message: string): MentorMemory[] {
  const memories: MentorMemory[] = [];
  for (const { re, type, confidence } of BELIEF_PATTERNS) {
    const m = message.match(re);
    if (m) {
      memories.push({
        memoryType: type,
        text: m[0].trim(),
        confidence,
      });
    }
  }
  if (memories.length === 0 && message.length > 15 && /\bi (feel|think|believe|know)\b/i.test(message)) {
    memories.push({
      memoryType: "thought",
      text: message.trim().slice(0, 200),
      confidence: 0.72,
    });
  }
  return memories;
}

export async function persistMentorMemories(
  supabase: SupabaseClient,
  userId: string,
  memories: MentorMemory[],
  source = "chat"
): Promise<void> {
  for (const mem of memories) {
    const { data: existing } = await supabase
      .from("mentor_memories")
      .select("id, mention_count, confidence")
      .eq("user_id", userId)
      .ilike("text", mem.text.slice(0, 80))
      .maybeSingle();

    if (existing) {
      await supabase
        .from("mentor_memories")
        .update({
          mention_count: (existing.mention_count ?? 1) + 1,
          confidence: Math.min(0.98, (existing.confidence ?? 0.8) + 0.02),
          last_mentioned_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("mentor_memories").insert({
        user_id: userId,
        memory_type: mem.memoryType,
        text: mem.text,
        confidence: mem.confidence,
        source,
        mention_count: 1,
      });
    }

    const area = inferAreaFromText(mem.text);
    if (area) {
      await bumpLifeAreaWeight(supabase, userId, area as LifeAreaKey, 0.08);
    }
  }
}

/** Process chat message for beliefs, patterns, and life-area updates. */
export async function ingestChatMentorSignal(
  supabase: SupabaseClient,
  userId: string,
  message: string
): Promise<void> {
  await runMemoryMaintenance(supabase, userId, message);

  const memories = extractMentorMemoriesFromText(message);
  if (memories.length > 0) {
    await persistMentorMemories(supabase, userId, memories, "chat");
  }

  for (const pattern of detectPatternsInText(message)) {
    await recordPatternMention(supabase, userId, pattern, "chat");
  }

  const area = inferAreaFromText(message);
  if (area && /\b(also|into|interested|care about|focus on)\b/i.test(message)) {
    await bumpLifeAreaWeight(supabase, userId, area, 0.12);
  }
}

export async function loadMentorMemories(
  supabase: SupabaseClient,
  userId: string,
  limit = 12
): Promise<
  Array<{
    memoryType: string;
    text: string;
    confidence: number;
    effectiveConfidence: number;
    mentionCount: number;
    lastMentionedAt: string | null;
  }>
> {
  const { data } = await supabase
    .from("mentor_memories")
    .select("memory_type, text, confidence, mention_count, last_mentioned_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("last_mentioned_at", { ascending: false })
    .limit(limit * 2);

  return (data || [])
    .map((r) => {
      const effective = effectiveConfidence(
        r.confidence ?? 0.8,
        r.last_mentioned_at,
        r.mention_count ?? 1
      );
      return {
        memoryType: r.memory_type,
        text: r.text,
        confidence: r.confidence ?? 0.8,
        effectiveConfidence: effective,
        mentionCount: r.mention_count ?? 1,
        lastMentionedAt: r.last_mentioned_at,
      };
    })
    .filter((m) => m.effectiveConfidence >= 0.35)
    .slice(0, limit);
}

export function formatMentorMemoriesForPrompt(
  memories: Array<{
    memoryType: string;
    text: string;
    confidence: number;
    effectiveConfidence?: number;
    mentionCount: number;
  }>
): string {
  if (memories.length === 0) return "No stored thoughts/beliefs yet.";
  return memories
    .map((m) => {
      const conf = Math.round((m.effectiveConfidence ?? m.confidence) * 100);
      return `- [${m.memoryType}] "${m.text}" (${conf}% influence, ${m.mentionCount} mentions)`;
    })
    .join("\n");
}
