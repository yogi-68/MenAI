import type { SupabaseClient } from "@supabase/supabase-js";
import type { EvidenceBundle } from "@/lib/user-model/evidence-bundle";
import { computeLifeAreaWeights, type LifeAreaKey } from "@/lib/plans/life-area-balancer";
import { loadMentorMemories } from "@/lib/mentor/mentor-memory";
import { computeThemeActivity } from "@/lib/user-model/memory-graph-identity";
import { isConcreteGoalTitle } from "@/lib/goals/concreteness-gate";

export interface RankedPattern {
  pattern: string;
  mentions: number;
  confidence: number;
  behavioralImpact: string | null;
  rankScore: number;
}

export interface MemoryRetrievalContext {
  primaryInitiative: string | null;
  primaryDirectionMemory: string | null;
  priorDirections: string[];
  coreValues: Array<{ text: string; evidenceCount: number; influence: number }>;
  secondaryLifeAreas: Array<{ area: string; label: string; weight: number; source: string }>;
  recentEmergingAreas: string[];
  patterns: RankedPattern[];
  mentorMemories: EvidenceBundle["mentorMemories"];
  relationshipNotes: string[];
  freedomTheme: boolean;
  reflectionBlockers: string[];
  activePlanningConstraints: string[];
  goals: string[];
  identitySignals: string[];
  totalReflections: number;
}

function patternRankScore(p: {
  occurrences?: number | null;
  confidence?: number | null;
  influence_score?: number | null;
  last_mentioned_at?: string | null;
  last_detected?: string | null;
}): number {
  if (p.influence_score != null && p.influence_score > 0) return p.influence_score;
  return (p.occurrences ?? 1) * (p.confidence ?? 0.7);
}

const AREA_LABELS: Record<string, string> = {
  business: "business",
  finance: "finance",
  health: "fitness",
  learning: "learning",
  career: "career",
  relationships: "relationships",
  personal: "personal",
};

/** Load ranked memory graph for chat + synthesis — not just current initiative. */
export async function loadMemoryRetrievalContext(
  supabase: SupabaseClient,
  userId: string,
  bundle?: EvidenceBundle
): Promise<MemoryRetrievalContext> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [weights, patternsRes, reflectionsRes, goalsRes, signalsRes, initiativesRes, profileRes, priorDirRes] =
    await Promise.all([
      computeLifeAreaWeights(supabase, userId),
      supabase
        .from("execution_patterns")
        .select("pattern, behavioral_impact, confidence, occurrences, influence_score, last_mentioned_at, last_detected")
        .eq("user_id", userId)
        .in("status", ["active", "supporting"])
        .order("influence_score", { ascending: false })
        .limit(8),
      supabase
        .from("daily_reflections")
        .select("blocked_by, moved_forward")
        .eq("user_id", userId)
        .gte("reflection_date", sevenDaysAgo.toISOString().split("T")[0])
        .order("reflection_date", { ascending: false })
        .limit(5),
      supabase
        .from("goals")
        .select("title, category")
        .eq("user_id", userId)
        .eq("status", "active")
        .limit(12),
      supabase
        .from("identity_signals")
        .select("description, long_term_direction")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("goals")
        .select("id, title, life_area")
        .eq("user_id", userId)
        .eq("goal_kind", "execution")
        .eq("status", "active")
        .limit(5),
      supabase
        .from("profiles")
        .select("current_focus_goal_id")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("mentor_memories")
        .select("text, archived_at")
        .eq("user_id", userId)
        .eq("memory_type", "direction")
        .in("status", ["superseded", "archived"])
        .order("archived_at", { ascending: false })
        .limit(5),
    ]);

  const mentorMemories = bundle?.mentorMemories ?? (await loadMentorMemories(supabase, userId, 15));

  const patterns: RankedPattern[] = (patternsRes.data || [])
    .map((p) => ({
      pattern: p.pattern,
      mentions: p.occurrences ?? 1,
      confidence: p.confidence ?? 0.7,
      behavioralImpact: p.behavioral_impact,
      rankScore: patternRankScore(p),
    }))
    .sort((a, b) => b.rankScore - a.rankScore);

  const activeInits = initiativesRes.data || [];
  const focusId = profileRes.data?.current_focus_goal_id;
  const focusedInit = focusId
    ? activeInits.find((i) => i.id === focusId)
    : activeInits[0];

  let primaryInit = bundle?.focusTitle ?? focusedInit?.title ?? null;

  const activeDirections = mentorMemories
    .filter((m) => m.memoryType === "direction")
    .sort((a, b) => b.influenceScore - a.influenceScore);

  const topDirection = activeDirections[0];
  if (topDirection && topDirection.influenceScore >= 0.35) {
    primaryInit = directionToFocusLabel(topDirection.text) ?? primaryInit;
  }

  if (!primaryInit) {
    const upscGoal = (goalsRes.data || []).find((g) => /upsc|exam prep/i.test(g.title));
    primaryInit =
      upscGoal?.title ??
      (signalsRes.data || []).find((s) => /upsc|exam/i.test(`${s.description} ${s.long_term_direction || ""}`))
        ?.long_term_direction ??
      goalsRes.data?.[0]?.title ??
      null;
  }

  const primaryArea = focusedInit?.life_area ?? activeInits[0]?.life_area ?? "business";

  const secondaryLifeAreas = Object.entries(weights as Record<LifeAreaKey, number>)
    .filter(([area, w]) => w >= 0.12 && area !== primaryArea)
    .sort((a, b) => b[1] - a[1])
    .map(([area, w]) => ({
      area,
      label: AREA_LABELS[area] || area,
      weight: w,
      source: "life_area_weights",
    }));

  const themes = bundle ? computeThemeActivity(bundle) : [];
  const recentEmergingAreas = themes
    .filter((t) => t.recent && t.key !== primaryArea && t.mentions >= 1)
    .map((t) => t.theme);

  const relationshipNotes = mentorMemories
    .filter((m) => m.memoryType === "relationship_note" || /\b(girlfriend|boyfriend|partner|wife|husband)\b/i.test(m.text))
    .map((m) => m.text);

  const corpus = [
    ...mentorMemories.map((m) => m.text),
    ...(goalsRes.data || []).map((g) => g.title),
    ...(signalsRes.data || []).map((s) => `${s.description} ${s.long_term_direction || ""}`),
  ].join(" ");

  const freedomTheme = /freedom|independen|own business|not (a )?stable job|stable job|recurring income/i.test(
    corpus
  );

  const reflectionBlockers = (reflectionsRes.data || [])
    .map((r) => r.blocked_by?.trim())
    .filter(Boolean) as string[];

  const activePlanningConstraints: string[] = [];
  const reactive = patterns.find((p) => p.pattern === "reactive_schedule");
  if (reactive && reactive.mentions >= 1) {
    activePlanningConstraints.push(
      `Reactive schedule (${reactive.mentions} mentions) — assume fragmented days; prefer 1 critical outcome + 2 interruptible tasks`
    );
  }
  if (patterns.some((p) => p.pattern === "overthinking" && p.mentions >= 2)) {
    activePlanningConstraints.push(
      "Overthinking pattern — bias plans toward conversation and shipping, not research"
    );
  }

  const priorDirections = (priorDirRes.data || []).map((m) => m.text);

  const coreValues = mentorMemories
    .filter((m) => m.memoryType === "core_value")
    .map((m) => ({
      text: m.text,
      evidenceCount: m.evidenceCount ?? m.mentionCount,
      influence: m.influenceScore,
    }))
    .sort((a, b) => b.influence - a.influence);

  const totalReflections = bundle?.reflections7d ?? reflectionsRes.data?.length ?? 0;

  return {
    primaryInitiative: primaryInit,
    primaryDirectionMemory: topDirection?.text ?? null,
    priorDirections,
    coreValues,
    secondaryLifeAreas,
    recentEmergingAreas,
    patterns,
    mentorMemories,
    relationshipNotes,
    freedomTheme,
    reflectionBlockers,
    activePlanningConstraints,
    goals: (goalsRes.data || []).map((g) => g.title),
    identitySignals: (signalsRes.data || []).map(
      (s) => s.long_term_direction || s.description
    ),
    totalReflections,
  };
}

function directionToFocusLabel(text: string): string | null {
  const t = text.toLowerCase();
  if (/upsc|exam/.test(t)) return "UPSC preparation";
  if (/finance agency/.test(t)) return "building a finance agency";
  if (/business/.test(t)) return "building businesses";
  if (/preparing for|building|studying for|launching|training for/.test(t)) {
    return text.replace(/^i('m| am) /i, "").trim();
  }
  return text.slice(0, 80);
}

export function detectRetrievalIntent(message: string): "focus" | "stuck" | "identity" | "plan" | null {
  const m = message.toLowerCase();
  if (/\b(who am i|what do you know about me)\b/.test(m)) return "identity";
  if (/\b(what am i focusing|what('s| is) my focus|focusing on|current focus|what should i focus)\b/.test(m))
    return "focus";
  if (/\b(why am i stuck|why stuck|what stops me|what keeps stopping|why can't i)\b/.test(m))
    return "stuck";
  if (/\b(plan my day|today's plan|what should i do today)\b/.test(m)) return "plan";
  return null;
}

/** Multi-area focus answer — primary initiative + emerging secondary areas. */
export function buildFocusSynthesis(ctx: MemoryRetrievalContext): string {
  const lines: string[] = [];
  const focus =
    ctx.primaryDirectionMemory
      ? directionToFocusLabel(ctx.primaryDirectionMemory)
      : ctx.primaryInitiative;

  if (focus) {
    lines.push(`${focus} is your primary focus right now.`);
  } else if (ctx.primaryInitiative) {
    lines.push(`Primary direction on file: ${ctx.primaryInitiative}.`);
  }

  const fitnessSecondary =
    ctx.secondaryLifeAreas.find((a) => a.label === "fitness") ||
    ctx.coreValues.some((v) => /fitness|gym|training/.test(v.text.toLowerCase()));

  const secondary = [
    ...(fitnessSecondary ? ["fitness"] : []),
    ...ctx.recentEmergingAreas,
    ...ctx.secondaryLifeAreas.map((a) => a.label),
  ].filter((v, i, arr) => arr.indexOf(v) === i && v !== focus?.toLowerCase());

  if (secondary.length > 0) {
    lines.push(`Secondary areas also matter: ${secondary.slice(0, 3).join(", ")}.`);
  }

  if (ctx.priorDirections.length > 0 && focus && /upsc/i.test(focus)) {
    lines.push(
      `Note: earlier direction (${ctx.priorDirections[0].slice(0, 60)}) was superseded — do NOT present old focus as current.`
    );
  }

  if (lines.length === 0) {
    return "No clear primary focus yet — share what you're building and complete a few tasks.";
  }
  return lines.join("\n");
}

/** Pattern synthesis for "why am I stuck" — uses evidence counts, not keyword parroting. */
export function buildPatternSynthesis(ctx: MemoryRetrievalContext): string {
  const overthink = ctx.patterns.find((p) => p.pattern === "overthinking");
  const reflectionNote =
    ctx.totalReflections > 0 ? "conversations and reflections" : "conversations";

  if (!overthink || overthink.mentions < 2) {
    const top = ctx.patterns[0];
    if (top) {
      return `The strongest friction pattern is ${top.pattern.replace(/_/g, " ")} — appeared ${top.mentions} times across ${reflectionNote} (${Math.round(top.rankScore * 100)}% influence). ${top.behavioralImpact || "It slows execution when it shows up."}`;
    }
    return "Not enough pattern history yet — keep sharing what blocks you in chat and reflections.";
  }

  const totalEvidence = overthink.mentions + (ctx.reflectionBlockers.some((b) => /overthink/i.test(b)) ? 1 : 0);

  return [
    `Overthinking has appeared ${totalEvidence} times across your recent ${reflectionNote} (${Math.round(overthink.rankScore * 100)}% influence).`,
    "What stands out: you often know the next action but delay committing to it.",
    "The pattern suggests hesitation around committing to decisions rather than lack of information.",
    "Counter with one small irreversible action today — not more research.",
  ].join("\n");
}

/** Full mentor identity synthesis — evolution-aware: core values persist, directions can shift. */
export function buildMentorIdentitySynthesis(
  ctx: MemoryRetrievalContext,
  bundle: EvidenceBundle
): string {
  const paragraphs: string[] = [];
  const themes = computeThemeActivity(bundle);

  const freedomValue = ctx.coreValues.find((v) => /freedom|independen|financial/.test(v.text.toLowerCase()));
  if (freedomValue || ctx.freedomTheme) {
    const ev = freedomValue?.evidenceCount ?? 1;
    const inf = Math.round((freedomValue?.influence ?? 0.85) * 100);
    paragraphs.push(
      `You consistently value freedom and independence (evidence: ${ev}×, influence: ${inf}%). This core belief persists even when your execution focus changes.`
    );
  }

  const hasPriorBusiness =
    ctx.priorDirections.some((d) => /business|agency|finance/.test(d.toLowerCase())) ||
    themes.some((t) => t.key === "business" || t.key === "wealth");
  const currentUpsc =
    ctx.primaryDirectionMemory && /upsc|exam/i.test(ctx.primaryDirectionMemory);

  if (hasPriorBusiness && currentUpsc) {
    paragraphs.push(
      "Earlier conversations focused on business ownership and financial freedom, but your recent attention has shifted toward UPSC preparation."
    );
  } else if (hasPriorBusiness && !currentUpsc) {
    paragraphs.push(
      "Business ownership and financial independence recur as themes in how you think about your future."
    );
  }

  const fitnessValue = ctx.coreValues.find((v) => /fitness|gym|training/.test(v.text.toLowerCase()));
  if (fitnessValue) {
    paragraphs.push(
      `Fitness remains a recurring part of how you think about discipline and self-improvement (evidence: ${fitnessValue.evidenceCount}×) — not vanity, but part of who you're becoming.`
    );
  } else {
    const fitnessTheme = themes.find((t) => t.key === "fitness");
    if (fitnessTheme?.recent) {
      paragraphs.push(
        `Fitness has emerged recently as an area you care about alongside your main pursuit.`
      );
    }
  }

  const overthink = ctx.patterns.find((p) => p.pattern === "overthinking");
  if (overthink && overthink.mentions >= 2) {
    paragraphs.push(
      `A pattern that repeatedly appears is overthinking (${overthink.mentions}× across conversations). Committing to a direction is often harder for you than generating ideas.`
    );
  }

  if (ctx.relationshipNotes.length > 0) {
    paragraphs.push(
      "You've shown awareness that ambition can affect relationships — particularly how much time and energy work consumes."
    );
  }

  if (ctx.priorDirections.length > 0) {
    paragraphs.push(
      `Do NOT describe the user as still pursuing: ${ctx.priorDirections.slice(0, 2).join("; ")} — those directions were superseded.`
    );
  }

  if (ctx.primaryInitiative && isConcreteGoalTitle(ctx.primaryInitiative)) {
    paragraphs.push(`Right now execution is anchored on: ${ctx.primaryInitiative}.`);
  }

  if (paragraphs.length === 0) {
    return buildFocusSynthesis(ctx);
  }
  return paragraphs.join("\n\n");
}

export function formatMemoryRetrievalForPrompt(
  ctx: MemoryRetrievalContext,
  userMessage: string
): string {
  const intent = detectRetrievalIntent(userMessage);
  const lines: string[] = [
    "## MEMORY GRAPH (living memory — ranked by influence, not recency alone)",
    "Statuses: ACTIVE = primary influence, SUPPORTING = secondary, archived/superseded = ignored.",
    "",
    `Primary focus (evolved): ${ctx.primaryInitiative || "none"}`,
    ...(ctx.priorDirections.length
      ? [`Superseded directions (DO NOT present as current): ${ctx.priorDirections.slice(0, 3).join("; ")}`]
      : []),
    ...(ctx.coreValues.length
      ? [
          "Core values (persist across pivots):",
          ...ctx.coreValues.slice(0, 5).map(
            (v) => `- "${v.text}" (evidence ${v.evidenceCount}×, influence ${Math.round(v.influence * 100)}%)`
          ),
        ]
      : []),
    `Active goals: ${ctx.goals.join("; ") || "none"}`,
    `Identity signals: ${ctx.identitySignals.join("; ") || "none"}`,
    "",
    "Life-area balance (secondary areas MUST appear in focus/identity answers):",
    ...ctx.secondaryLifeAreas.map(
      (a) => `- ${a.label}: ${Math.round(a.weight * 100)}% attention weight`
    ),
    ...(ctx.recentEmergingAreas.length
      ? [`Recently emerging: ${ctx.recentEmergingAreas.join(", ")}`]
      : []),
    "",
    "Execution patterns (ranked by influence × evidence):",
    ...ctx.patterns.map(
      (p) =>
        `- ${p.pattern}: evidence ${p.mentions}×, influence ${Math.round(p.rankScore * 100)}%${p.behavioralImpact ? ` — ${p.behavioralImpact}` : ""}`
    ),
    "",
    "Mentor memories (structured — also mirrored to vector layer):",
    ...ctx.mentorMemories.slice(0, 8).map((m) => {
      const ev = m.evidenceCount ?? m.mentionCount;
      const inf = Math.round((m.influenceScore ?? m.effectiveConfidence) * 100);
      return `- [${m.memoryType}] "${m.text}" (evidence ${ev}×, influence ${inf}%)`;
    }),
    ...(ctx.reflectionBlockers.length
      ? ["", "Recent reflection blockers:", ...ctx.reflectionBlockers.map((b) => `- ${b}`)]
      : []),
    ...(ctx.activePlanningConstraints.length
      ? ["", "Planning constraints from memory:", ...ctx.activePlanningConstraints.map((c) => `- ${c}`)]
      : []),
  ];

  if (intent === "focus") {
    lines.push("", "## REQUIRED FOCUS SYNTHESIS (use this structure):", buildFocusSynthesis(ctx));
  } else if (intent === "stuck") {
    lines.push("", "## REQUIRED PATTERN SYNTHESIS (use this — do not parrot one keyword):", buildPatternSynthesis(ctx));
  } else if (intent === "identity") {
    lines.push(
      "",
      "## REQUIRED IDENTITY SYNTHESIS",
      "Weave a mentor narrative: recurring freedom theme, business vs stability, fitness as discipline, overthinking with mention counts, relationship/ambition tension.",
      "Use narrative paragraphs — never a bullet list of facts."
    );
  } else if (intent === "plan" && ctx.activePlanningConstraints.length) {
    lines.push(
      "",
      "## PLAN MUST HONOR:",
      ...ctx.activePlanningConstraints.map((c) => `- ${c}`)
    );
  }

  lines.push(
    "",
    "RULE: Never answer from primary initiative alone when secondary areas, patterns, or beliefs exist on file."
  );

  return lines.join("\n");
}

export function formatMemoryGraphSummary(ctx: MemoryRetrievalContext): string {
  const parts: string[] = [];
  if (ctx.primaryInitiative) parts.push(`Focus: ${ctx.primaryInitiative}`);
  if (ctx.secondaryLifeAreas.length) {
    parts.push(
      `Secondary: ${ctx.secondaryLifeAreas.map((a) => `${a.label} (${Math.round(a.weight * 100)}%)`).join(", ")}`
    );
  }
  if (ctx.patterns[0]) {
    parts.push(`Top pattern: ${ctx.patterns[0].pattern} (${ctx.patterns[0].mentions}×)`);
  }
  return parts.join(" · ");
}

export interface PinnedMemory {
  text: string;
  memoryType: string;
  memoryClass: string | null;
  confidence: number;
}

/** Load permanent mentor memories — always injected before semantic search. */
export async function loadPinnedMemories(
  supabase: SupabaseClient,
  userId: string
): Promise<PinnedMemory[]> {
  const { data } = await supabase
    .from("mentor_memories")
    .select("text, memory_type, memory_class, confidence")
    .eq("user_id", userId)
    .eq("is_permanent", true)
    .eq("status", "active")
    .order("confidence", { ascending: false })
    .limit(20);

  return (data || []).map((row) => ({
    text: row.text,
    memoryType: row.memory_type,
    memoryClass: row.memory_class ?? null,
    confidence: row.confidence ?? 0.85,
  }));
}

export function formatPinnedMemoriesForPrompt(memories: PinnedMemory[]): string {
  if (memories.length === 0) return "";

  const lines = [
    "## PINNED MEMORIES (permanent — never forget these)",
    "These facts persist across all conversations. Reference them naturally when relevant.",
    "",
    ...memories.map((m) => {
      const cls = m.memoryClass ? ` · ${m.memoryClass}` : "";
      return `- [${m.memoryType}${cls}] "${m.text}" (${Math.round(m.confidence * 100)}% confidence)`;
    }),
  ];

  return lines.join("\n");
}
