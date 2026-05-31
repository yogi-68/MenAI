import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPatternGuidanceLines } from "@/lib/plans/pattern-task-guidance";

export interface WeaknessProfile {
  pattern: string;
  confidence: number;
  mentions: number;
  behavioralImpact: string | null;
  severity: string | null;
  planningNote: string | null;
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
];

export function detectPatternsInText(text: string): string[] {
  const found = new Set<string>();
  for (const { re, pattern } of CHAT_PATTERN_SIGNALS) {
    if (re.test(text)) found.add(pattern);
  }
  return [...found];
}

/** Load weakness profiles with mention counts for planning. */
export async function loadWeaknessProfiles(
  supabase: SupabaseClient,
  userId: string
): Promise<WeaknessProfile[]> {
  const { data } = await supabase
    .from("execution_patterns")
    .select("pattern, confidence, occurrences, behavioral_impact, severity")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("occurrences", { ascending: false })
    .limit(6);

  const profiles: WeaknessProfile[] = (data || []).map((p) => {
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
    };
  });

  return profiles.sort((a, b) => b.mentions * b.confidence - a.mentions * a.confidence);
}

/** Record pattern mention from chat or onboarding — increments occurrences. */
export async function recordPatternMention(
  supabase: SupabaseClient,
  userId: string,
  pattern: string,
  source: string,
  behavioralImpact?: string
): Promise<void> {
  const { data: existing } = await supabase
    .from("execution_patterns")
    .select("id, occurrences, confidence")
    .eq("user_id", userId)
    .eq("pattern", pattern)
    .maybeSingle();

  if (existing) {
    const mentions = (existing.occurrences ?? 0) + 1;
    const confidence = Math.min(0.98, (existing.confidence ?? 0.7) + 0.03);
    await supabase
      .from("execution_patterns")
      .update({
        occurrences: mentions,
        confidence,
        last_detected: new Date().toISOString(),
        source,
      })
      .eq("id", existing.id);
    return;
  }

  await supabase.from("execution_patterns").insert({
    user_id: userId,
    pattern,
    trigger: source,
    behavioral_impact: behavioralImpact || `Mentioned in ${source}`,
    frequency: "frequent",
    severity: "medium",
    confidence: 0.75,
    occurrences: 1,
  });
}

export function formatWeaknessProfilesForPrompt(profiles: WeaknessProfile[]): string[] {
  return profiles.map((p) => {
    const conf = Math.round(p.confidence * 100);
    return `WEAKNESS: ${p.pattern} (confidence ${conf}%, mentions ${p.mentions}) — ${p.planningNote || p.behavioralImpact || "Counter this in today's tasks"}`;
  });
}
