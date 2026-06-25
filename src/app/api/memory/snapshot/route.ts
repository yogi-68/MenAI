import { NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Returns everything stored for the logged-in user across memory tables.
 * Use this instead of hand-written SQL when debugging storage/retrieval.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = await createServiceRoleClient();
  const userId = user.id;

  const [
    profileRes,
    mentorRes,
    patternsRes,
    vectorRes,
    goalsRes,
    initiativesRes,
    signalsRes,
    messageCountRes,
  ] = await Promise.all([
    service
      .from("profiles")
      .select(
        "life_area_weights, life_area_last_mentioned, user_model_updated_at, current_focus_goal_id"
      )
      .eq("id", userId)
      .maybeSingle(),
    service
      .from("mentor_memories")
      .select(
        "memory_type, status, text, confidence, influence_score, evidence_count, mention_count, last_mentioned_at, expires_at"
      )
      .eq("user_id", userId)
      .in("status", ["active", "supporting"])
      .order("influence_score", { ascending: false })
      .limit(25),
    service
      .from("execution_patterns")
      .select(
        "pattern, status, confidence, influence_score, occurrences, last_mentioned_at, behavioral_impact"
      )
      .eq("user_id", userId)
      .in("status", ["active", "supporting"])
      .order("influence_score", { ascending: false })
      .limit(15),
    service
      .from("memories")
      .select("id, memory_type, content, created_at, metadata")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(15),
    service.from("goals").select("title, status, category").eq("user_id", userId).eq("goal_kind", "direction").eq("status", "active"),
    service
      .from("goals")
      .select("title, status, life_area")
      .eq("user_id", userId)
      .eq("goal_kind", "execution")
      .eq("status", "active"),
    service
      .from("identity_signals")
      .select("description, long_term_direction, status, confidence")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10),
    service
      .from("conversations")
      .select("id")
      .eq("user_id", userId),
  ]);

  const mentorError = mentorRes.error?.message ?? null;
  const patternsError = patternsRes.error?.message ?? null;

  const { count: vectorCount } = await service
    .from("memories")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  const { count: mentorCount } = await service
    .from("mentor_memories")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  let messageCount = 0;
  const convIds = (messageCountRes.data || []).map((c) => c.id);
  if (convIds.length > 0) {
    const { count } = await service
      .from("messages")
      .select("id", { count: "exact", head: true })
      .in("conversation_id", convIds);
    messageCount = count ?? 0;
  }

  const vectorWithEmbedding = await service
    .from("memories")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .not("embedding", "is", null);

  return NextResponse.json({
    userId,
    architecture: {
      layer1_event: "messages + conversations + memories (pgvector) — what was said",
      layer2_meaning:
        "mentor_memories + execution_patterns + identity_signals + life_area_weights + user_model — what matters",
      dualWrite: "Every mentor_memory and pattern is mirrored to vector memories as natural-language narrative",
    },
    counts: {
      messages: messageCount,
      mentorMemories: mentorCount ?? 0,
      vectorMemories: vectorCount ?? 0,
      vectorWithEmbeddings: vectorWithEmbedding.count ?? 0,
      activeGoals: goalsRes.data?.length ?? 0,
      activeInitiatives: initiativesRes.data?.length ?? 0,
    },
    profile: profileRes.data ?? null,
    mentorMemories: mentorRes.data ?? [],
    mentorMemoriesError: mentorError,
    executionPatterns: patternsRes.data ?? [],
    executionPatternsError: patternsError,
    vectorMemoriesRecent: (vectorRes.data ?? []).map((m) => ({
      memoryType: m.memory_type,
      preview: m.content.slice(0, 120),
      createdAt: m.created_at,
      importance: (m.metadata as Record<string, unknown>)?.importance,
    })),
    goals: goalsRes.data ?? [],
    initiatives: initiativesRes.data ?? [],
    identitySignals: signalsRes.data ?? [],
    migrationsHint:
      mentorError?.includes("does not exist") || mentorError?.includes("influence_score")
        ? "Run migrations 035, 036, 037 in supabase/migrations/"
        : null,
  });
}
