import type { SupabaseClient } from "@supabase/supabase-js";
import { detectDomain, type CoachDomain } from "@/lib/plans/coach-insights";
import { loadExecutionContext } from "@/lib/user-model/resolve-context";
import { loadPlanContextData } from "@/lib/plans/plan-interview";
import type { IdentityProfileStore } from "@/lib/user-model/identity-dimensions";
import { loadMentorMemories } from "@/lib/mentor/mentor-memory";
import { runMemoryMaintenance } from "@/lib/mentor/memory-aging";

export interface EvidenceBundle {
  vision: string | null;
  founderMode: boolean;
  workStyle: string | null;
  goals: Array<{ title: string; category: string | null; targetDate: string | null }>;
  initiatives: Array<{
    id: string;
    title: string;
    description: string | null;
    lifeArea: string | null;
    domain: string;
    targetDate: string | null;
  }>;
  focusInitiativeId: string | null;
  focusTitle: string | null;
  focusDomain: CoachDomain;
  identitySignals: Array<{ description: string; long_term_direction: string | null }>;
  patterns: Array<{
    pattern: string;
    behavioral_impact: string | null;
    confidence?: number | null;
    occurrences?: number | null;
  }>;
  mentorMemories: Array<{
    memoryType: string;
    text: string;
    confidence: number;
    effectiveConfidence: number;
    influenceScore: number;
    mentionCount: number;
    evidenceCount: number;
    lastMentionedAt: string | null;
  }>;
  completedTasks7d: number;
  reflections7d: number;
  reflectionBlocks: string[];
  opportunities: string[];
  planContextFields: Record<string, unknown>;
  identityAnswers: IdentityProfileStore["answers"];
}

export async function buildEvidenceBundle(
  supabase: SupabaseClient,
  userId: string,
  identityProfile: IdentityProfileStore
): Promise<EvidenceBundle> {
  const ctx = await loadExecutionContext(supabase, userId);
  const primary = ctx.primaryInitiative;

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  await runMemoryMaintenance(supabase, userId).catch(() => {});

  const [profileRes, patternsRes, mentorMemories, reflectionsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("work_style, founder_mode")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("execution_patterns")
      .select("pattern, behavioral_impact, confidence, occurrences, influence_score")
      .eq("user_id", userId)
      .in("status", ["active", "supporting"])
      .order("influence_score", { ascending: false })
      .limit(6),
    loadMentorMemories(supabase, userId, 10),
    supabase
      .from("daily_reflections")
      .select("blocked_by")
      .eq("user_id", userId)
      .gte("reflection_date", sevenDaysAgo.toISOString().split("T")[0])
      .order("reflection_date", { ascending: false })
      .limit(5),
  ]);

  const planContext = primary
    ? await loadPlanContextData(supabase, userId, primary.id)
    : {};

  const initiatives = ctx.initiatives.map((i) => ({
    id: i.id,
    title: i.title,
    description: i.description,
    lifeArea: i.life_area,
    domain: detectDomain(`${i.title} ${i.description || ""}`, i.life_area),
    targetDate: i.target_date,
  }));

  return {
    vision: ctx.profile?.vision ?? null,
    founderMode: Boolean(profileRes.data?.founder_mode),
    workStyle: profileRes.data?.work_style ?? null,
    goals: ctx.goals.map((g) => ({
      title: g.title,
      category: g.category,
      targetDate: g.target_date,
    })),
    initiatives,
    focusInitiativeId: ctx.focusInitiativeId,
    focusTitle: primary?.title ?? null,
    focusDomain: primary
      ? detectDomain(`${primary.title} ${primary.description || ""}`, primary.life_area)
      : "general",
    identitySignals: ctx.identitySignals,
    patterns: patternsRes.data || [],
    mentorMemories,
    completedTasks7d: ctx.completedTasks7d,
    reflections7d: ctx.reflections7d,
    reflectionBlocks: (reflectionsRes.data || [])
      .map((r) => r.blocked_by?.trim())
      .filter(Boolean) as string[],
    opportunities: ctx.opportunities.map((o) => o.title),
    planContextFields: planContext as Record<string, unknown>,
    identityAnswers: identityProfile.answers || {},
  };
}

export function formatEvidenceBundleForPrompt(bundle: EvidenceBundle): string {
  const lines: string[] = [
    `Vision: ${bundle.vision || "none"}`,
    `Founder mode: ${bundle.founderMode}`,
    `Work style (stored): ${bundle.workStyle || "none"}`,
    `Long-term goals (${bundle.goals.length}): ${bundle.goals.map((g) => g.title).join("; ") || "none"}`,
    `Active initiatives (${bundle.initiatives.length}): ${bundle.initiatives.map((i) => `${i.title} [${i.domain}]`).join("; ") || "none"}`,
    `Current focus: ${bundle.focusTitle || "unset"}`,
    `Identity signals: ${bundle.identitySignals.map((s) => s.long_term_direction || s.description).join("; ") || "none"}`,
    `Execution patterns: ${bundle.patterns.map((p) => `${p.pattern} (${p.occurrences ?? 1}× evidence)`).join("; ") || "none"}`,
    `Thoughts & beliefs: ${bundle.mentorMemories.map((m) => `[${m.memoryType}] ${m.text} (evidence ${m.evidenceCount ?? m.mentionCount}×, influence ${Math.round(m.influenceScore * 100)}%)`).join("; ") || "none"}`,
    `Tasks completed (7d): ${bundle.completedTasks7d}`,
    `Reflections (7d): ${bundle.reflections7d}`,
    `Reflection blockers: ${bundle.reflectionBlocks.join("; ") || "none"}`,
    `Opportunities: ${bundle.opportunities.join("; ") || "none"}`,
    `Planning context fields: ${JSON.stringify(bundle.planContextFields)}`,
    `Identity interview answers: ${JSON.stringify(bundle.identityAnswers)}`,
  ];
  return lines.join("\n");
}
