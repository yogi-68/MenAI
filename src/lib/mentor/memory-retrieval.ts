import type { SupabaseClient } from "@supabase/supabase-js";
import type { EvidenceBundle } from "@/lib/user-model/evidence-bundle";
import { computeLifeAreaWeights, type LifeAreaKey } from "@/lib/plans/life-area-balancer";
import { loadMentorMemories } from "@/lib/mentor/mentor-memory";
import { computeThemeActivity } from "@/lib/user-model/memory-graph-identity";
import { isConcreteInitiativeTitle } from "@/lib/initiatives/concreteness-gate";

export interface RankedPattern {
  pattern: string;
  mentions: number;
  confidence: number;
  behavioralImpact: string | null;
  rankScore: number;
}

export interface MemoryRetrievalContext {
  primaryInitiative: string | null;
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

  const [weights, patternsRes, reflectionsRes, goalsRes, signalsRes, initiativesRes, profileRes] =
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
        .from("initiatives")
        .select("id, title, life_area")
        .eq("user_id", userId)
        .eq("status", "active")
        .limit(5),
      supabase
        .from("profiles")
        .select("current_focus_initiative_id")
        .eq("id", userId)
        .maybeSingle(),
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
  const focusId = profileRes.data?.current_focus_initiative_id;
  const focusedInit = focusId
    ? activeInits.find((i) => i.id === focusId)
    : activeInits[0];

  let primaryInit = bundle?.focusTitle ?? focusedInit?.title ?? null;
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

  return {
    primaryInitiative: primaryInit,
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
  };
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
  if (ctx.primaryInitiative && isConcreteInitiativeTitle(ctx.primaryInitiative)) {
    lines.push(`Primary execution focus: ${ctx.primaryInitiative}.`);
  } else if (ctx.primaryInitiative) {
    lines.push(`Primary direction on file: ${ctx.primaryInitiative}.`);
  }

  const secondary = [
    ...ctx.recentEmergingAreas,
    ...ctx.secondaryLifeAreas.map((a) => a.label),
  ].filter((v, i, arr) => arr.indexOf(v) === i);

  if (secondary.length > 0) {
    lines.push(
      `Secondary areas also matter recently: ${secondary.slice(0, 3).join(", ")} — mentioned in chat, goals, or life-area balance.`
    );
    lines.push(
      `Business/main initiative gets execution priority; secondary areas (e.g. fitness) should appear in plans and identity — never ignore them.`
    );
  }

  if (lines.length === 0) {
    return "No clear primary focus yet — share what you're building and complete a few tasks.";
  }
  return lines.join("\n");
}

/** Pattern synthesis for "why am I stuck" — uses mention counts, not keyword parroting. */
export function buildPatternSynthesis(ctx: MemoryRetrievalContext): string {
  const overthink = ctx.patterns.find((p) => p.pattern === "overthinking");
  if (!overthink || overthink.mentions < 2) {
    const top = ctx.patterns[0];
    if (top) {
      return `The strongest friction pattern on file is ${top.pattern.replace(/_/g, " ")} (${top.mentions} mentions, ${Math.round(top.confidence * 100)}% confidence). ${top.behavioralImpact || "It slows execution when it shows up."}`;
    }
    return "Not enough pattern history yet — keep sharing what blocks you in chat and reflections.";
  }

  return [
    `Overthinking has come up ${overthink.mentions} times in your stored patterns (${Math.round(overthink.confidence * 100)}% confidence).`,
    "What stands out: you often know the next action but delay committing to it.",
    "In recent conversations, uncertainty about committing seems more limiting than lack of knowledge.",
    "Planning should counter this with one small irreversible action — talk to a user, send outreach, ship a draft — not more research.",
  ].join("\n");
}

/** Full mentor identity synthesis — freedom theme, relationships, patterns. */
export function buildMentorIdentitySynthesis(
  ctx: MemoryRetrievalContext,
  bundle: EvidenceBundle
): string {
  const paragraphs: string[] = [];
  const themes = computeThemeActivity(bundle);

  if (ctx.freedomTheme || themes.some((t) => t.key === "wealth" || t.key === "business")) {
    paragraphs.push(
      "Across your conversations, a recurring theme is freedom — you consistently return to business ownership and financial independence rather than traditional stability."
    );
  }

  const fitness = themes.find((t) => t.key === "fitness");
  const business = themes.find((t) => t.key === "business" || t.key === "wealth");
  if (fitness && business) {
    paragraphs.push(
      "Fitness appears important to you, but mostly as part of becoming stronger and more disciplined — not as a separate vanity goal."
    );
  } else if (fitness?.recent) {
    paragraphs.push(
      `Fitness has emerged recently (${fitness.mentions} signal${fitness.mentions > 1 ? "s" : ""} on file) as an area you care about alongside your main pursuit.`
    );
  }

  const overthink = ctx.patterns.find((p) => p.pattern === "overthinking");
  if (overthink && overthink.mentions >= 2) {
    paragraphs.push(
      `A pattern that keeps appearing is overthinking (${overthink.mentions} mentions). Several conversations suggest committing to a direction is often harder than generating ideas.`
    );
  }

  if (ctx.relationshipNotes.length > 0) {
    paragraphs.push(
      "You've also shown awareness that ambition can affect relationships — particularly how much time and energy work consumes."
    );
  } else if (ctx.mentorMemories.some((m) => /\bwork too much\b/i.test(m.text))) {
    paragraphs.push(
      "You've mentioned working too much — balancing ambition with personal life is part of your story, not a generic tip."
    );
  }

  if (ctx.primaryInitiative && isConcreteInitiativeTitle(ctx.primaryInitiative)) {
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
    `Primary initiative: ${ctx.primaryInitiative || "none"}`,
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
    "Execution patterns (ranked by mentions × confidence):",
    ...ctx.patterns.map(
      (p) =>
        `- ${p.pattern}: ${p.mentions} mentions, ${Math.round(p.confidence * 100)}% conf${p.behavioralImpact ? ` — ${p.behavioralImpact}` : ""}`
    ),
    "",
    "Thoughts, beliefs, relationship notes:",
    ...ctx.mentorMemories.slice(0, 8).map(
      (m) =>
        `- [${m.memoryType}] "${m.text}" (${Math.round((m.influenceScore ?? m.effectiveConfidence) * 100)}% influence, ${m.mentionCount} mentions)`
    ),
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
