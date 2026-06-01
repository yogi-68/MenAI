import type { SupabaseClient } from "@supabase/supabase-js";
import { invalidateUserCache } from "@/lib/ai/orchestrator/cache-invalidation";
import { runMemoryMaintenance } from "@/lib/mentor/memory-aging";
import {
  classifyMemoryTier,
  computeInfluenceScore,
  findSimilarMemory,
  parseOpportunityExpiry,
  statusFromInfluence,
  touchLifeAreaMention,
} from "@/lib/mentor/memory-lifecycle";
import { bumpLifeAreaWeight, inferAreaFromText, type LifeAreaKey } from "@/lib/plans/life-area-balancer";
import { recordPatternMention, detectPatternsInText } from "@/lib/mentor/weakness-engine";

export type MentorMemoryType =
  | "belief"
  | "thought"
  | "relationship_note"
  | "self_talk"
  | "pattern_mention"
  | "core_value"
  | "direction"
  | "opportunity";

export interface MentorMemory {
  memoryType: MentorMemoryType;
  text: string;
  confidence: number;
  expiresAt?: string;
}

const BELIEF_PATTERNS: Array<{ re: RegExp; type: MentorMemoryType; confidence: number }> = [
  { re: /\bi doubt myself\b/i, type: "belief", confidence: 0.88 },
  { re: /\bi keep researching\b/i, type: "belief", confidence: 0.9 },
  { re: /\bi (tend to|always) overthink\b/i, type: "belief", confidence: 0.92 },
  { re: /\bi work too much\b/i, type: "self_talk", confidence: 0.85 },
  { re: /\bmy (girlfriend|boyfriend|partner|wife|husband) thinks i overthink\b/i, type: "relationship_note", confidence: 0.87 },
  { re: /\bmy (girlfriend|boyfriend|partner|wife|husband) thinks i work too much\b/i, type: "relationship_note", confidence: 0.9 },
  { re: /\b(girlfriend|boyfriend|partner).*(work too much|never home|always working)\b/i, type: "relationship_note", confidence: 0.88 },
  { re: /\bfreedom (over|rather than|instead of).*(stable job|job security|9 to 5)\b/i, type: "core_value", confidence: 0.92 },
  { re: /\bi (want|value) freedom over\b/i, type: "core_value", confidence: 0.91 },
  { re: /\bi (want|value) financial independence\b/i, type: "core_value", confidence: 0.9 },
  { re: /\bi (care about|enjoy) (fitness|building things|building)\b/i, type: "core_value", confidence: 0.88 },
  { re: /\bi('m| am) (also )?(into|interested in)\s+(fitness|gym|working out|training)\b/i, type: "core_value", confidence: 0.9 },
  { re: /\bi started (gym|working out|training)\b/i, type: "core_value", confidence: 0.91 },
  { re: /\b(preparing for|building a|training for|launching|studying for)\s+.+/i, type: "direction", confidence: 0.9 },
  { re: /\b(have an?|got an?) (interview|exam|deadline|presentation)\b/i, type: "opportunity", confidence: 0.85 },
  { re: /\b(interview|deadline|exam).*(next|tomorrow|this week)\b/i, type: "opportunity", confidence: 0.87 },
];

export function extractMentorMemoriesFromText(message: string): MentorMemory[] {
  const memories: MentorMemory[] = [];
  for (const { re, type, confidence } of BELIEF_PATTERNS) {
    const m = message.match(re);
    if (m) {
      const mem: MentorMemory = {
        memoryType: type,
        text: m[0].trim(),
        confidence,
      };
      if (type === "opportunity") {
        mem.expiresAt = parseOpportunityExpiry(message).toISOString();
      }
      memories.push(mem);
    }
  }
  if (memories.length === 0 && message.length > 15 && /\bi (feel|think|believe|know)\b/i.test(message)) {
    const tier = classifyMemoryTier(message);
    memories.push({
      memoryType: tier,
      text: message.trim().slice(0, 200),
      confidence: 0.72,
      ...(tier === "opportunity"
        ? { expiresAt: parseOpportunityExpiry(message).toISOString() }
        : {}),
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
    const existing = await findSimilarMemory(supabase, userId, mem.text);
    const now = new Date().toISOString();
    const area = inferAreaFromText(mem.text);

    if (existing) {
      const mentionCount = (existing.mention_count ?? 1) + 1;
      const confidence = Math.min(0.98, (existing.confidence ?? 0.8) + 0.02);
      const influence = computeInfluenceScore({
        confidence,
        mentionCount,
        lastMentionedAt: now,
        memoryType: existing.memory_type || mem.memoryType,
      });
      const status = statusFromInfluence(influence, 0, existing.memory_type || mem.memoryType);

      await supabase
        .from("mentor_memories")
        .update({
          mention_count: mentionCount,
          confidence,
          influence_score: influence,
          status,
          last_mentioned_at: now,
          updated_at: now,
        })
        .eq("id", existing.id);
    } else {
      const influence = computeInfluenceScore({
        confidence: mem.confidence,
        mentionCount: 1,
        lastMentionedAt: now,
        memoryType: mem.memoryType,
        expiresAt: mem.expiresAt,
      });

      await supabase.from("mentor_memories").insert({
        user_id: userId,
        memory_type: mem.memoryType,
        text: mem.text,
        confidence: mem.confidence,
        influence_score: influence,
        status: statusFromInfluence(influence, 0, mem.memoryType),
        source,
        mention_count: 1,
        last_mentioned_at: now,
        expires_at: mem.expiresAt ?? null,
        life_area: area,
      });
    }

    if (area) {
      await bumpLifeAreaWeight(supabase, userId, area as LifeAreaKey, mem.memoryType === "core_value" ? 0.12 : 0.08);
      await touchLifeAreaMention(supabase, userId, area as LifeAreaKey);
    }
  }
}

/** Process chat message for beliefs, patterns, and life-area updates. */
export async function ingestChatMentorSignal(
  supabase: SupabaseClient,
  userId: string,
  message: string
): Promise<{ pivoted: boolean }> {
  const { pivoted } = await runMemoryMaintenance(supabase, userId, message);
  if (pivoted) {
    invalidateUserCache(userId, "direction pivot");
  }

  const memories = extractMentorMemoriesFromText(message);
  if (memories.length > 0) {
    await persistMentorMemories(supabase, userId, memories, "chat");
  }

  for (const pattern of detectPatternsInText(message)) {
    const impact =
      pattern === "reactive_schedule"
        ? "Meetings and reactive work crowd out deep execution"
        : pattern === "overthinking"
          ? "Gathering information instead of testing assumptions"
          : undefined;
    await recordPatternMention(supabase, userId, pattern, "chat", impact);
  }

  const area = inferAreaFromText(message);
  if (area && /\b(also|into|interested|care about|focus on|started gym|working out)\b/i.test(message)) {
    await bumpLifeAreaWeight(supabase, userId, area, 0.12);
    await touchLifeAreaMention(supabase, userId, area);
  }

  return { pivoted };
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
    influenceScore: number;
    mentionCount: number;
    lastMentionedAt: string | null;
    status: string;
  }>
> {
  const { data } = await supabase
    .from("mentor_memories")
    .select(
      "memory_type, text, confidence, mention_count, last_mentioned_at, influence_score, status, expires_at"
    )
    .eq("user_id", userId)
    .in("status", ["active", "supporting"])
    .order("influence_score", { ascending: false })
    .limit(limit * 2);

  const now = Date.now();

  return (data || [])
    .filter((r) => !r.expires_at || new Date(r.expires_at).getTime() > now)
    .map((r) => {
      const influence =
        r.influence_score ??
        computeInfluenceScore({
          confidence: r.confidence ?? 0.8,
          mentionCount: r.mention_count ?? 1,
          lastMentionedAt: r.last_mentioned_at,
          memoryType: r.memory_type,
          status: r.status,
          expiresAt: r.expires_at,
        });
      return {
        memoryType: r.memory_type,
        text: r.text,
        confidence: r.confidence ?? 0.8,
        effectiveConfidence: influence,
        influenceScore: influence,
        mentionCount: r.mention_count ?? 1,
        lastMentionedAt: r.last_mentioned_at,
        status: r.status,
      };
    })
    .filter((m) => m.influenceScore >= 0.2)
    .slice(0, limit);
}

export function formatMentorMemoriesForPrompt(
  memories: Array<{
    memoryType: string;
    text: string;
    confidence: number;
    effectiveConfidence?: number;
    influenceScore?: number;
    mentionCount: number;
    status?: string;
  }>
): string {
  if (memories.length === 0) return "No stored thoughts/beliefs yet.";
  return memories
    .map((m) => {
      const influence = Math.round((m.influenceScore ?? m.effectiveConfidence ?? m.confidence) * 100);
      const tier = m.status === "supporting" ? "supporting" : "active";
      return `- [${m.memoryType}/${tier}] "${m.text}" (${influence}% influence, ${m.mentionCount} mentions)`;
    })
    .join("\n");
}
