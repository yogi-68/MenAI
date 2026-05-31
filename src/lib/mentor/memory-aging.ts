import type { SupabaseClient } from "@supabase/supabase-js";

const MS_PER_DAY = 86400000;

export interface DirectionPivot {
  isPivot: boolean;
  newDirection: string | null;
  abandonedTopics: string[];
  reason: string | null;
}

const PIVOT_SIGNALS = [
  /\b(i )?(quit|stopped|gave up|abandoned|moved on from|no longer|walked away from)\b/i,
  /\b(switch(ed|ing)? to|now preparing|preparing for|focusing on now|pivot(ed|ing)? to)\b/i,
  /\b(that('s| is)? (over|done|behind me)|different path now)\b/i,
];

const TOPIC_PATTERNS: Array<{ re: RegExp; topic: string }> = [
  { re: /\b(finance agency|agency client|consulting agency)\b/i, topic: "finance agency" },
  { re: /\b(startup|saas|mvp|product launch)\b/i, topic: "startup" },
  { re: /\b(upsc|exam prep|studying for)\b/i, topic: "upsc" },
  { re: /\b(fitness|gym|workout|body fat)\b/i, topic: "fitness" },
  { re: /\b(invest(ing|ment)|portfolio|wealth)\b/i, topic: "investing" },
  { re: /\b(freelanc(e|ing)|client work)\b/i, topic: "freelancing" },
];

/** Detect explicit direction shifts — "I quit that, preparing for UPSC". */
export function detectDirectionPivot(message: string): DirectionPivot {
  const text = message.trim();
  const isPivot = PIVOT_SIGNALS.some((re) => re.test(text));
  if (!isPivot) {
    return { isPivot: false, newDirection: null, abandonedTopics: [], reason: null };
  }

  const topics = TOPIC_PATTERNS.filter(({ re }) => re.test(text)).map((t) => t.topic);
  const newDirection =
    topics.find((t) => /\b(upsc|exam|studying)\b/i.test(text) && t === "upsc") ||
    topics[topics.length - 1] ||
    null;

  const abandonedTopics = topics.filter((t) => t !== newDirection);
  if (/\b(quit|stopped|gave up|abandoned|that)\b/i.test(text) && abandonedTopics.length === 0) {
    abandonedTopics.push("previous direction");
  }

  return {
    isPivot: true,
    newDirection,
    abandonedTopics,
    reason: "User signaled a direction change",
  };
}

/** Effective confidence after time decay — old memories lose influence. */
export function effectiveConfidence(
  base: number,
  lastMentionedAt: string | Date | null,
  mentionCount: number
): number {
  if (!lastMentionedAt) return base * 0.85;
  const days = Math.floor((Date.now() - new Date(lastMentionedAt).getTime()) / MS_PER_DAY);
  const decay = Math.floor(days / 30) * 0.08;
  const mentionBoost = Math.min(0.15, (mentionCount - 1) * 0.02);
  return Math.max(0.12, Math.min(0.98, base + mentionBoost - decay));
}

/** Archive memories matching abandoned topics after a pivot. */
export async function archiveMemoriesForPivot(
  supabase: SupabaseClient,
  userId: string,
  pivot: DirectionPivot
): Promise<void> {
  if (!pivot.isPivot) return;

  const { data: memories } = await supabase
    .from("mentor_memories")
    .select("id, text")
    .eq("user_id", userId)
    .eq("status", "active");

  for (const mem of memories || []) {
    const text = mem.text.toLowerCase();
    const shouldArchive =
      pivot.abandonedTopics.some((topic) => text.includes(topic)) ||
      (pivot.abandonedTopics.includes("previous direction") &&
        /\b(agency|startup|saas|finance|business)\b/i.test(text) &&
        pivot.newDirection === "upsc");

    if (shouldArchive) {
      await supabase
        .from("mentor_memories")
        .update({
          status: "superseded",
          archived_at: new Date().toISOString(),
          archived_reason: pivot.reason,
          confidence: 0.2,
        })
        .eq("id", mem.id);
    }
  }

  const { data: signals } = await supabase
    .from("identity_signals")
    .select("id, description, long_term_direction")
    .eq("user_id", userId)
    .eq("status", "active");

  for (const sig of signals || []) {
    const corpus = `${sig.description} ${sig.long_term_direction || ""}`.toLowerCase();
    const hit = pivot.abandonedTopics.some((t) => corpus.includes(t.replace("_", " ")));
    if (hit || (pivot.newDirection === "upsc" && /\b(business|agency|startup|finance)\b/.test(corpus))) {
      await supabase
        .from("identity_signals")
        .update({ status: "archived" })
        .eq("id", sig.id);
    }
  }

  if (pivot.newDirection) {
    await supabase.from("identity_signals").insert({
      user_id: userId,
      type: "direction",
      description: `Pivot: ${pivot.newDirection}`,
      long_term_direction: pivot.newDirection,
      confidence: 0.92,
      status: "active",
      source: "direction_pivot",
    });
  }
}

/** Age stale memories — decay confidence, archive when irrelevant. */
export async function ageStaleMemories(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const cutoff90 = new Date(Date.now() - 90 * MS_PER_DAY).toISOString();

  const { data: memories } = await supabase
    .from("mentor_memories")
    .select("id, confidence, mention_count, last_mentioned_at, status")
    .eq("user_id", userId)
    .eq("status", "active");

  for (const mem of memories || []) {
    const effective = effectiveConfidence(
      mem.confidence ?? 0.8,
      mem.last_mentioned_at,
      mem.mention_count ?? 1
    );
    const stale = mem.last_mentioned_at && mem.last_mentioned_at < cutoff90;

    if (stale && effective < 0.35) {
      await supabase
        .from("mentor_memories")
        .update({
          status: "archived",
          archived_at: new Date().toISOString(),
          archived_reason: "Stale — not mentioned in 90+ days",
          confidence: effective,
        })
        .eq("id", mem.id);
    } else if (Math.abs(effective - (mem.confidence ?? 0.8)) > 0.05) {
      await supabase
        .from("mentor_memories")
        .update({ confidence: effective })
        .eq("id", mem.id);
    }
  }

  const cutoff60 = new Date(Date.now() - 60 * MS_PER_DAY).toISOString();
  const { data: patterns } = await supabase
    .from("execution_patterns")
    .select("id, confidence, last_detected, occurrences")
    .eq("user_id", userId)
    .eq("status", "active");

  for (const p of patterns || []) {
    const last = p.last_detected;
    if (last && last < cutoff60 && (p.occurrences ?? 0) < 3) {
      const decayed = Math.max(0.25, (p.confidence ?? 0.7) - 0.15);
      await supabase
        .from("execution_patterns")
        .update({ confidence: decayed })
        .eq("id", p.id);
      if (decayed < 0.3) {
        await supabase
          .from("execution_patterns")
          .update({
            status: "archived",
            archived_at: new Date().toISOString(),
          })
          .eq("id", p.id);
      }
    }
  }
}

/** Run aging + pivot handling on each memory write path. */
export async function runMemoryMaintenance(
  supabase: SupabaseClient,
  userId: string,
  message?: string
): Promise<void> {
  if (message) {
    const pivot = detectDirectionPivot(message);
    if (pivot.isPivot) {
      await archiveMemoriesForPivot(supabase, userId, pivot);
    }
  }
  await ageStaleMemories(supabase, userId);
}
