import type { SupabaseClient } from "@supabase/supabase-js";
import { scheduleUserModelRefresh } from "@/lib/user-model/synthesis-engine";
import {
  runDailyMemoryLifecycle,
} from "@/lib/mentor/memory-lifecycle";

export { effectiveConfidence } from "@/lib/mentor/memory-lifecycle";

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
  const lower = text.toLowerCase();
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
  if (/\b(quit|stopped|gave up|abandoned|that)\b/i.test(text)) {
    if (/\b(finance agency|finance|agency|business)\b/i.test(lower)) {
      if (!abandonedTopics.includes("finance agency")) abandonedTopics.push("finance agency");
      if (/\b(building )?business/.test(lower) && !abandonedTopics.includes("business")) {
        abandonedTopics.push("business");
      }
    }
    if (abandonedTopics.length === 0) abandonedTopics.push("previous direction");
  }

  return {
    isPivot: true,
    newDirection,
    abandonedTopics,
    reason: "User signaled a direction change",
  };
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
    .select("id, text, memory_type")
    .eq("user_id", userId)
    .in("status", ["active", "supporting"]);

  for (const mem of memories || []) {
    const text = mem.text.toLowerCase();
    const isDirection =
      mem.memory_type === "direction" ||
      /\b(building|preparing|launching|agency|upsc|startup)\b/i.test(text);
    const shouldArchive =
      pivot.abandonedTopics.some((topic) => text.includes(topic)) ||
      (pivot.abandonedTopics.includes("previous direction") &&
        /\b(agency|startup|saas|finance|business)\b/i.test(text) &&
        pivot.newDirection === "upsc") ||
      (isDirection &&
        pivot.newDirection &&
        !text.includes(pivot.newDirection.replace("_", " ")) &&
        pivot.abandonedTopics.some((t) => text.includes(t.replace("_", " "))));

    if (shouldArchive) {
      await supabase
        .from("mentor_memories")
        .update({
          status: "superseded",
          archived_at: new Date().toISOString(),
          archived_reason: pivot.reason,
          confidence: 0.2,
          influence_score: 0,
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

    await supabase.from("mentor_memories").insert({
      user_id: userId,
      memory_type: "direction",
      text: `Now focusing on: ${pivot.newDirection}`,
      confidence: 0.92,
      influence_score: 0.88,
      source: "direction_pivot",
      mention_count: 1,
      status: "active",
    });
  }

  const { data: patterns } = await supabase
    .from("execution_patterns")
    .select("id, pattern, behavioral_impact")
    .eq("user_id", userId)
    .in("status", ["active", "supporting"]);

  for (const p of patterns || []) {
    const corpus = `${p.pattern} ${p.behavioral_impact || ""}`.toLowerCase();
    const hit = pivot.abandonedTopics.some((t) => corpus.includes(t.replace("_", " ")));
    if (
      hit ||
      (pivot.newDirection === "upsc" &&
        /\b(business|agency|client|finance|startup)\b/.test(corpus))
    ) {
      await supabase
        .from("execution_patterns")
        .update({
          status: "superseded",
          archived_at: new Date().toISOString(),
          influence_score: 0,
        })
        .eq("id", p.id);
    }
  }

  await applyPivotToInitiativesAndGoals(supabase, userId, pivot);
}

/** Abandon stale initiatives and seed new direction after explicit pivot. */
async function applyPivotToInitiativesAndGoals(
  supabase: SupabaseClient,
  userId: string,
  pivot: DirectionPivot
): Promise<void> {
  const { data: initiatives } = await supabase
    .from("goals")
    .select("id, title, life_area")
    .eq("user_id", userId)
    .eq("goal_kind", "execution")
    .eq("status", "active");

  let abandonedFocusId: string | null = null;

  for (const init of initiatives || []) {
    const corpus = init.title.toLowerCase();
    const shouldAbandon =
      pivot.abandonedTopics.some((t) => corpus.includes(t.replace("_", " "))) ||
      (pivot.abandonedTopics.includes("finance agency") &&
        /\b(agency|finance|business)\b/.test(corpus)) ||
      (pivot.newDirection === "upsc" && /\b(agency|finance|business|client)\b/.test(corpus));

    if (shouldAbandon) {
      abandonedFocusId = init.id;
      await supabase
        .from("goals")
        .update({ status: "abandoned", updated_at: new Date().toISOString() })
        .eq("id", init.id);
    }
  }

  if (pivot.newDirection === "upsc") {
    const { data: existingGoal } = await supabase
      .from("goals")
      .select("id")
      .eq("user_id", userId)
      .ilike("title", "%upsc%")
      .maybeSingle();

    if (!existingGoal) {
      await supabase.from("goals").insert({
        user_id: userId,
        title: "Prepare for UPSC",
        category: "learning",
        priority: "high",
        goal_kind: "direction",
        status: "active",
        source: "direction_pivot",
      });
    }

    await supabase.from("identity_signals").insert({
      user_id: userId,
      type: "direction",
      description: "Preparing for UPSC",
      long_term_direction: "UPSC exam preparation",
      confidence: 0.95,
      status: "active",
      source: "direction_pivot",
    });
  }

  const profileUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (abandonedFocusId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("current_focus_goal_id")
      .eq("id", userId)
      .maybeSingle();

    if (profile?.current_focus_goal_id === abandonedFocusId) {
      profileUpdate.current_focus_goal_id = null;
      profileUpdate.current_focus_until = null;
    }
  }

  await supabase.from("profiles").update(profileUpdate).eq("id", userId);
}

/** Run aging + pivot handling + full daily lifecycle on each memory write path. */
export async function runMemoryMaintenance(
  supabase: SupabaseClient,
  userId: string,
  message?: string
): Promise<{ pivoted: boolean }> {
  let pivoted = false;
  if (message) {
    const pivot = detectDirectionPivot(message);
    if (pivot.isPivot) {
      await archiveMemoriesForPivot(supabase, userId, pivot);
      pivoted = true;
      scheduleUserModelRefresh(supabase, userId);
    }
  }
  await runDailyMemoryLifecycle(supabase, userId);
  return { pivoted };
}

/** @deprecated Use runDailyMemoryLifecycle — kept for callers that only aged memories. */
export async function ageStaleMemories(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  await runDailyMemoryLifecycle(supabase, userId);
}
