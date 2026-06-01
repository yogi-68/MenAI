import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPatternGuidanceLines } from "@/lib/plans/pattern-task-guidance";
import {
  computePatternInfluence,
  patternStatusFromInfluence,
  daysSince,
} from "@/lib/mentor/memory-lifecycle";

export interface WeaknessProfile {
  pattern: string;
  confidence: number;
  mentions: number;
  behavioralImpact: string | null;
  severity: string | null;
  planningNote: string | null;
  influenceScore: number;
}

const CHAT_PATTERN_SIGNALS: Array<{ re: RegExp; pattern: string }> = [
  { re: /\boverthink/i, pattern: "overthinking" },
  { re: /\bkeep researching\b/i, pattern: "overthinking" },
  { re: /\banalysis paralysis\b/i, pattern: "overthinking" },
  { re: /\bprocrastinat/i, pattern: "procrastination" },
  { re: /\bput(ting)? off\b/i, pattern: "procrastination" },
  { re: /\bavoid(ing)?\b/i, pattern: "avoidance" },
  { re: /\bperfect(ion)?/i, pattern: "perfectionism" },
  { re: /\bscatter|too many priorities\b/i, pattern: "scattered_focus" },
  { re: /\binconsistent|can't stick\b/i, pattern: "inconsistency" },
  { re: /\bburn(ed)? out|exhausted\b/i, pattern: "burnout" },
  { re: /\bdoubt myself\b/i, pattern: "overthinking" },
  { re: /\bwork too much\b/i, pattern: "burnout" },
  {
    re: /\bmeeting|calendar|calls?\b.*\b(took|ate|filled|most of)\b|\breactive\b|\bback-to-back\b/i,
    pattern: "reactive_schedule",
  },
];

export function detectPatternsInText(text: string): string[] {
  const found = new Set<string>();
  for (const { re, pattern } of CHAT_PATTERN_SIGNALS) {
    if (re.test(text)) found.add(pattern);
  }
  return [...found];
}

/** Load weakness profiles ranked by influence (not just mention count). */
export async function loadWeaknessProfiles(
  supabase: SupabaseClient,
  userId: string
): Promise<WeaknessProfile[]> {
  const { data } = await supabase
    .from("execution_patterns")
    .select(
      "pattern, confidence, occurrences, behavioral_impact, severity, influence_score, last_mentioned_at, last_detected, status"
    )
    .eq("user_id", userId)
    .in("status", ["active", "supporting"])
    .order("influence_score", { ascending: false })
    .limit(8);

  const profiles: WeaknessProfile[] = (data || []).map((p) => {
    const lastAt = p.last_mentioned_at || p.last_detected;
    const influence =
      p.influence_score ??
      computePatternInfluence({
        confidence: p.confidence ?? 0.7,
        occurrences: p.occurrences ?? 1,
        lastMentionedAt: lastAt,
        status: p.status,
      });
    const guidance = buildPatternGuidanceLines([
      { pattern: p.pattern, behavioral_impact: p.behavioral_impact, severity: p.severity },
    ]);
    return {
      pattern: p.pattern,
      confidence: p.confidence ?? 0.7,
      mentions: p.occurrences ?? 1,
      behavioralImpact: p.behavioral_impact,
      severity: p.severity,
      planningNote: guidance[0] ?? null,
      influenceScore: influence,
    };
  });

  return profiles
    .filter((p) => p.influenceScore >= 0.2)
    .sort((a, b) => b.influenceScore - a.influenceScore);
}

/** Record pattern mention — boosts confidence on repeat, decays when absent. */
export async function recordPatternMention(
  supabase: SupabaseClient,
  userId: string,
  pattern: string,
  source: string,
  behavioralImpact?: string
): Promise<void> {
  const now = new Date().toISOString();
  const { data: existing } = await supabase
    .from("execution_patterns")
    .select("id, occurrences, confidence, status")
    .eq("user_id", userId)
    .eq("pattern", pattern)
    .maybeSingle();

  if (existing) {
    const mentions = (existing.occurrences ?? 0) + 1;
    const confidence = Math.min(0.98, (existing.confidence ?? 0.7) + 0.03);
    const influence = computePatternInfluence({
      confidence,
      occurrences: mentions,
      lastMentionedAt: now,
      status: "active",
    });
    const status = patternStatusFromInfluence(influence, 0);

    await supabase
      .from("execution_patterns")
      .update({
        occurrences: mentions,
        confidence,
        influence_score: influence,
        status,
        last_detected: now,
        last_mentioned_at: now,
        source,
      })
      .eq("id", existing.id);
    return;
  }

  const confidence = 0.75;
  const influence = computePatternInfluence({
    confidence,
    occurrences: 1,
    lastMentionedAt: now,
  });

  await supabase.from("execution_patterns").insert({
    user_id: userId,
    pattern,
    trigger: source,
    behavioral_impact: behavioralImpact || `Mentioned in ${source}`,
    frequency: "frequent",
    severity: "medium",
    confidence,
    influence_score: influence,
    occurrences: 1,
    last_mentioned_at: now,
    status: "active",
  });
}

export function formatWeaknessProfilesForPrompt(profiles: WeaknessProfile[]): string[] {
  return profiles.map((p) => {
    const conf = Math.round(p.influenceScore * 100);
    return `WEAKNESS: ${p.pattern} (influence ${conf}%, mentions ${p.mentions}) — ${p.planningNote || p.behavioralImpact || "Counter this in today's tasks"}`;
  });
}

/** Decay pattern confidence when user shows decisive behavior (task completion signal). */
export async function decayPatternOnDecisiveBehavior(
  supabase: SupabaseClient,
  userId: string,
  pattern = "overthinking"
): Promise<void> {
  const { data: existing } = await supabase
    .from("execution_patterns")
    .select("id, confidence, occurrences, last_mentioned_at, last_detected")
    .eq("user_id", userId)
    .eq("pattern", pattern)
    .in("status", ["active", "supporting"])
    .maybeSingle();

  if (!existing) return;

  const lastAt = existing.last_mentioned_at || existing.last_detected;
  if (daysSince(lastAt) < 7) return;

  const decayed = Math.max(0.2, (existing.confidence ?? 0.7) - 0.08);
  const influence = computePatternInfluence({
    confidence: decayed,
    occurrences: existing.occurrences ?? 1,
    lastMentionedAt: lastAt,
  });

  await supabase
    .from("execution_patterns")
    .update({
      confidence: decayed,
      influence_score: influence,
      status: patternStatusFromInfluence(influence, daysSince(lastAt)),
    })
    .eq("id", existing.id);
}
