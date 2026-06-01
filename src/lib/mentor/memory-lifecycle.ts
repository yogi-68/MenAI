import type { SupabaseClient } from "@supabase/supabase-js";
import type { LifeAreaKey } from "@/lib/plans/life-area-balancer";

const MS_PER_DAY = 86400000;

export type MemoryStatus =
  | "active"
  | "supporting"
  | "archived"
  | "expired"
  | "superseded"
  | "deleted";

export type MemoryTier =
  | "core_value"
  | "direction"
  | "opportunity"
  | "belief"
  | "thought"
  | "relationship_note"
  | "self_talk"
  | "pattern_mention";

/** Days until influence halves — core values decay slowest. */
const DECAY_HALF_LIFE_DAYS: Record<string, number> = {
  core_value: 365,
  direction: 120,
  belief: 90,
  relationship_note: 90,
  thought: 60,
  self_talk: 45,
  pattern_mention: 30,
  opportunity: 7,
};

const INFLUENCE_ACTIVE = 0.55;
const INFLUENCE_SUPPORTING = 0.25;
const INFLUENCE_DELETE = 0.12;
const INFLUENCE_ARCHIVE = 0.22;

export function daysSince(date: string | Date | null | undefined): number {
  if (!date) return 999;
  return Math.floor((Date.now() - new Date(date).getTime()) / MS_PER_DAY);
}

/** influence = confidence × recency × mention_boost */
export function computeInfluenceScore(input: {
  confidence: number;
  mentionCount: number;
  lastMentionedAt: string | Date | null;
  memoryType: string;
  status?: string;
  expiresAt?: string | null;
}): number {
  if (
    input.status === "expired" ||
    input.status === "deleted" ||
    input.status === "superseded" ||
    input.status === "archived"
  ) {
    return 0;
  }

  if (input.expiresAt && new Date(input.expiresAt) < new Date()) {
    return 0;
  }

  const days = daysSince(input.lastMentionedAt);
  const halfLife = DECAY_HALF_LIFE_DAYS[input.memoryType] ?? 90;
  const recencyFactor = Math.pow(0.5, days / halfLife);
  const mentionFactor = Math.min(1, 0.65 + Math.min(input.mentionCount, 12) * 0.03);

  return Math.max(0, Math.min(0.98, input.confidence * recencyFactor * mentionFactor));
}

/** Backward-compatible alias used across the codebase. */
export function effectiveConfidence(
  base: number,
  lastMentionedAt: string | Date | null,
  mentionCount: number,
  memoryType = "thought"
): number {
  return computeInfluenceScore({
    confidence: base,
    mentionCount,
    lastMentionedAt,
    memoryType,
  });
}

export function statusFromInfluence(
  influence: number,
  daysSinceMention: number,
  memoryType: string
): MemoryStatus {
  if (influence <= 0) return "expired";
  if (influence < INFLUENCE_DELETE && daysSinceMention > 45) return "deleted";
  if (influence < INFLUENCE_ARCHIVE && daysSinceMention > 60) return "archived";
  if (influence >= INFLUENCE_ACTIVE) return "active";
  if (influence >= INFLUENCE_SUPPORTING) return "supporting";
  if (memoryType === "core_value" && influence >= 0.18) return "supporting";
  return daysSinceMention > 90 ? "archived" : "supporting";
}

export function computePatternInfluence(input: {
  confidence: number;
  occurrences: number;
  lastMentionedAt: string | Date | null;
  status?: string;
}): number {
  if (input.status === "archived" || input.status === "deleted" || input.status === "superseded") {
    return 0;
  }
  const days = daysSince(input.lastMentionedAt);
  const recencyFactor = Math.pow(0.5, days / 60);
  const mentionFactor = Math.min(1, 0.6 + Math.min(input.occurrences, 10) * 0.04);
  return Math.max(0, Math.min(0.98, input.confidence * recencyFactor * mentionFactor));
}

export function patternStatusFromInfluence(influence: number, daysSinceMention: number): MemoryStatus {
  if (influence <= 0) return "archived";
  if (influence < INFLUENCE_DELETE && daysSinceMention > 60) return "deleted";
  if (influence < INFLUENCE_ARCHIVE && daysSinceMention > 45) return "archived";
  if (influence >= INFLUENCE_ACTIVE) return "active";
  if (influence >= INFLUENCE_SUPPORTING) return "supporting";
  return "supporting";
}

const STOP_WORDS = new Set([
  "a", "an", "the", "my", "i", "am", "to", "for", "and", "or", "of", "in", "on",
  "scalable", "successful", "really", "very", "just", "also",
]);

/** Normalize text for duplicate detection. */
export function normalizeMemoryKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w))
    .sort()
    .join(" ");
}

export function tokenSimilarity(a: string, b: string): number {
  const ka = normalizeMemoryKey(a);
  const kb = normalizeMemoryKey(b);
  if (!ka || !kb) return 0;
  if (ka === kb) return 1;
  const ta = new Set(ka.split(" "));
  const tb = new Set(kb.split(" "));
  const intersection = [...ta].filter((t) => tb.has(t)).length;
  const union = new Set([...ta, ...tb]).size;
  return union > 0 ? intersection / union : 0;
}

export function areDuplicateMemories(a: string, b: string): boolean {
  return tokenSimilarity(a, b) >= 0.65;
}

export function areDuplicateGoals(a: string, b: string): boolean {
  const sim = tokenSimilarity(a, b);
  if (sim >= 0.7) return true;
  const na = normalizeMemoryKey(a);
  const nb = normalizeMemoryKey(b);
  return na.includes(nb) || nb.includes(na);
}

/** Classify extracted text into memory tier. */
export function classifyMemoryTier(text: string): MemoryTier {
  const t = text.toLowerCase();
  if (
    /\b(freedom|independen|financial independence|value.*over|care about fitness|enjoy building)\b/i.test(
      t
    )
  ) {
    return "core_value";
  }
  if (/\b(preparing for|building a|training for|launching|studying for)\b/i.test(t)) {
    return "direction";
  }
  if (/\b(interview|deadline|exam on|presentation|meeting next|due next)\b/i.test(t)) {
    return "opportunity";
  }
  if (/\b(girlfriend|boyfriend|partner|wife|husband)\b/i.test(t)) {
    return "relationship_note";
  }
  if (/\bi (feel|think|believe|know|doubt|work too much)\b/i.test(t)) {
    return "belief";
  }
  return "thought";
}

/** Parse rough expiry for temporary context. */
export function parseOpportunityExpiry(message: string): Date {
  const lower = message.toLowerCase();
  const now = new Date();
  if (/\btomorrow\b/.test(lower)) {
    now.setDate(now.getDate() + 1);
    return now;
  }
  if (/\bnext week\b/.test(lower)) {
    now.setDate(now.getDate() + 7);
    return now;
  }
  if (/\bthis week\b/.test(lower)) {
    now.setDate(now.getDate() + 5);
    return now;
  }
  const dayMatch = lower.match(
    /\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/
  );
  if (dayMatch) {
    const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const target = days.indexOf(dayMatch[1]);
    const current = now.getDay();
    let delta = target - current;
    if (delta <= 0) delta += 7;
    now.setDate(now.getDate() + delta);
    return now;
  }
  now.setDate(now.getDate() + 7);
  return now;
}

interface MentorMemoryRow {
  id: string;
  text: string;
  memory_type: string;
  confidence: number;
  mention_count: number;
  last_mentioned_at: string;
  status: string;
  expires_at: string | null;
  influence_score: number | null;
}

/** Expire time-sensitive memories past expires_at. */
export async function expireTemporaryMemories(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const now = new Date().toISOString();
  const { data } = await supabase
    .from("mentor_memories")
    .select("id")
    .eq("user_id", userId)
    .in("status", ["active", "supporting"])
    .not("expires_at", "is", null)
    .lt("expires_at", now);

  let count = 0;
  for (const row of data || []) {
    await supabase
      .from("mentor_memories")
      .update({
        status: "expired",
        influence_score: 0,
        archived_at: new Date().toISOString(),
        archived_reason: "Temporary context expired",
      })
      .eq("id", row.id);
    count++;
  }
  return count;
}

/** Re-score all memories — confidence, influence, status. */
export async function rescoreMemories(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const { data: memories } = await supabase
    .from("mentor_memories")
    .select(
      "id, text, memory_type, confidence, mention_count, last_mentioned_at, status, expires_at, influence_score"
    )
    .eq("user_id", userId)
    .in("status", ["active", "supporting"]);

  for (const mem of (memories || []) as MentorMemoryRow[]) {
    const days = daysSince(mem.last_mentioned_at);
    const influence = computeInfluenceScore({
      confidence: mem.confidence ?? 0.8,
      mentionCount: mem.mention_count ?? 1,
      lastMentionedAt: mem.last_mentioned_at,
      memoryType: mem.memory_type,
      status: mem.status,
      expiresAt: mem.expires_at,
    });

    const newStatus = statusFromInfluence(influence, days, mem.memory_type);
    const decayedConfidence = Math.max(
      0.1,
      (mem.confidence ?? 0.8) - Math.floor(days / 30) * 0.04
    );

    const updates: Record<string, unknown> = {
      influence_score: influence,
      confidence: decayedConfidence,
      updated_at: new Date().toISOString(),
    };

    if (newStatus !== mem.status) {
      updates.status = newStatus;
      if (newStatus === "archived" || newStatus === "deleted" || newStatus === "expired") {
        updates.archived_at = new Date().toISOString();
        updates.archived_reason = `Influence dropped to ${Math.round(influence * 100)}%`;
      }
    }

    if (
      Math.abs(influence - (mem.influence_score ?? 0)) > 0.02 ||
      newStatus !== mem.status
    ) {
      await supabase.from("mentor_memories").update(updates).eq("id", mem.id);
    }
  }
}

/** Merge near-duplicate memories — keep strongest, supersede rest. */
export async function mergeDuplicateMemories(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { data: memories } = await supabase
    .from("mentor_memories")
    .select("id, text, memory_type, confidence, mention_count, influence_score, last_mentioned_at")
    .eq("user_id", userId)
    .in("status", ["active", "supporting"])
    .order("influence_score", { ascending: false });

  const rows = memories || [];
  const merged = new Set<string>();
  let mergeCount = 0;

  for (let i = 0; i < rows.length; i++) {
    if (merged.has(rows[i].id)) continue;
    const keeper = rows[i];
    let totalMentions = keeper.mention_count ?? 1;

    for (let j = i + 1; j < rows.length; j++) {
      if (merged.has(rows[j].id)) continue;
      if (!areDuplicateMemories(keeper.text, rows[j].text)) continue;

      totalMentions += rows[j].mention_count ?? 1;
      merged.add(rows[j].id);

      await supabase
        .from("mentor_memories")
        .update({
          status: "superseded",
          superseded_by: keeper.id,
          influence_score: 0,
          archived_at: new Date().toISOString(),
          archived_reason: `Merged into: ${keeper.text.slice(0, 60)}`,
        })
        .eq("id", rows[j].id);

      mergeCount++;
    }

    if (totalMentions > (keeper.mention_count ?? 1)) {
      const influence = computeInfluenceScore({
        confidence: Math.min(0.98, (keeper.confidence ?? 0.8) + 0.02),
        mentionCount: totalMentions,
        lastMentionedAt: keeper.last_mentioned_at,
        memoryType: keeper.memory_type,
      });
      await supabase
        .from("mentor_memories")
        .update({
          mention_count: totalMentions,
          confidence: Math.min(0.98, (keeper.confidence ?? 0.8) + 0.02),
          influence_score: influence,
          last_mentioned_at: new Date().toISOString(),
        })
        .eq("id", keeper.id);
    }
  }

  return mergeCount;
}

/** Merge duplicate active goals — archive weaker duplicates. */
export async function mergeDuplicateGoals(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { data: goals } = await supabase
    .from("goals")
    .select("id, title, progress, created_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  const rows = goals || [];
  const merged = new Set<string>();
  let count = 0;

  for (let i = 0; i < rows.length; i++) {
    if (merged.has(rows[i].id)) continue;
    const keeper = rows[i];

    for (let j = i + 1; j < rows.length; j++) {
      if (merged.has(rows[j].id)) continue;
      if (!areDuplicateGoals(keeper.title, rows[j].title)) continue;

      merged.add(rows[j].id);
      await supabase
        .from("goals")
        .update({ status: "abandoned" })
        .eq("id", rows[j].id);
      count++;
    }
  }

  return count;
}

/** Re-score execution patterns with time decay. */
export async function rescorePatterns(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const { data: patterns } = await supabase
    .from("execution_patterns")
    .select("id, confidence, occurrences, last_detected, last_mentioned_at, status, influence_score")
    .eq("user_id", userId)
    .in("status", ["active", "supporting"]);

  for (const p of patterns || []) {
    const lastAt = p.last_mentioned_at || p.last_detected;
    const days = daysSince(lastAt);
    const monthlyDecay = Math.floor(days / 30) * 0.08;
    const decayedConfidence = Math.max(0.15, (p.confidence ?? 0.7) - monthlyDecay);

    const influence = computePatternInfluence({
      confidence: decayedConfidence,
      occurrences: p.occurrences ?? 1,
      lastMentionedAt: lastAt,
      status: p.status,
    });

    const newStatus = patternStatusFromInfluence(influence, days);
    const updates: Record<string, unknown> = {
      confidence: decayedConfidence,
      influence_score: influence,
    };

    if (newStatus !== p.status) {
      updates.status = newStatus;
      if (newStatus === "archived" || newStatus === "deleted") {
        updates.archived_at = new Date().toISOString();
      }
    }

    await supabase.from("execution_patterns").update(updates).eq("id", p.id);
  }
}

/** Decay life-area weights when area hasn't been mentioned recently. */
export async function decayLifeAreaWeights(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("life_area_weights, life_area_last_mentioned")
    .eq("id", userId)
    .maybeSingle();

  const weights = {
    ...((profile?.life_area_weights as Record<string, number> | null) ?? {}),
  };
  const lastMentioned = {
    ...((profile?.life_area_last_mentioned as Record<string, string> | null) ?? {}),
  };

  let changed = false;
  for (const [area, weight] of Object.entries(weights)) {
    if (weight <= 0) continue;
    const days = daysSince(lastMentioned[area]);
    if (days < 30) continue;

    const decaySteps = Math.floor((days - 30) / 30);
    const decayed = Math.max(0.08, weight - decaySteps * 0.07);
    if (Math.abs(decayed - weight) > 0.01) {
      weights[area] = Math.round(decayed * 100) / 100;
      changed = true;
    }
  }

  if (!changed) return;

  const total = Object.values(weights).reduce((s, v) => s + v, 0);
  if (total > 0) {
    for (const k of Object.keys(weights)) {
      weights[k] = Math.round((weights[k] / total) * 100) / 100;
    }
  }

  await supabase
    .from("profiles")
    .update({ life_area_weights: weights })
    .eq("id", userId);
}

/** Record life-area mention timestamp for decay tracking. */
export async function touchLifeAreaMention(
  supabase: SupabaseClient,
  userId: string,
  area: LifeAreaKey
): Promise<void> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("life_area_last_mentioned")
    .eq("id", userId)
    .maybeSingle();

  const lastMentioned = {
    ...((profile?.life_area_last_mentioned as Record<string, string> | null) ?? {}),
    [area]: new Date().toISOString(),
  };

  await supabase
    .from("profiles")
    .update({ life_area_last_mentioned: lastMentioned })
    .eq("id", userId);
}

/** Full daily memory lifecycle — run on every chat ingest + evidence bundle build. */
export async function runDailyMemoryLifecycle(
  supabase: SupabaseClient,
  userId: string
): Promise<{ expired: number; merged: number; goalsMerged: number }> {
  const expired = await expireTemporaryMemories(supabase, userId);
  await rescoreMemories(supabase, userId);
  const merged = await mergeDuplicateMemories(supabase, userId);
  const goalsMerged = await mergeDuplicateGoals(supabase, userId);
  await rescorePatterns(supabase, userId);
  await decayLifeAreaWeights(supabase, userId);
  return { expired, merged, goalsMerged };
}

/** Find similar existing memory for upsert (fuzzy, not exact match). */
export async function findSimilarMemory(
  supabase: SupabaseClient,
  userId: string,
  text: string
): Promise<MentorMemoryRow | null> {
  const { data } = await supabase
    .from("mentor_memories")
    .select(
      "id, text, memory_type, confidence, mention_count, last_mentioned_at, status, expires_at, influence_score"
    )
    .eq("user_id", userId)
    .in("status", ["active", "supporting"])
    .limit(50);

  for (const row of (data || []) as MentorMemoryRow[]) {
    if (areDuplicateMemories(text, row.text)) return row;
  }
  return null;
}

export const RETRIEVABLE_STATUSES = ["active", "supporting"] as const;
