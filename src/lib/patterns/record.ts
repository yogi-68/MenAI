/**
 * Recording an execution pattern — the one way to do it.
 *
 * Five call sites used to hand-roll this: extraction, the weakness detector,
 * onboarding finalization, onboarding extraction, and the confidence Q&A.
 * Each did its own select-then-update-or-insert and set a different subset of
 * columns, so a pattern's shape depended on which path happened to create it.
 * Three of the five never computed `influence_score`, leaving it at the
 * column default until the nightly re-score corrected it; two used different
 * defaults for `frequency` and `severity` for the same observation.
 *
 * All of them also raced: the select and the insert are not atomic, and the
 * table had no unique constraint to catch the collision. Migration 045 adds
 * it, and this module upserts against it in a single statement.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { computePatternInfluence } from "@/lib/mentor/memory-lifecycle";
import { mirrorPatternToVector } from "@/lib/mentor/memory-vector-bridge";
import { logger } from "@/lib/observability/logger";
import { normalizePattern, type ExecutionPattern } from "./vocabulary";

export type PatternSource =
  | "chat"
  | "reflection"
  | "onboarding"
  | "extraction"
  | "confidence_qa";

export type PatternFrequency = "rare" | "occasional" | "frequent" | "constant";
export type PatternSeverity = "low" | "medium" | "high";

export interface RecordPatternInput {
  /** Raw name or free text. Normalized before it reaches the database. */
  pattern: string;
  source: PatternSource;
  behavioralImpact?: string | null;
  trigger?: string | null;
  frequency?: PatternFrequency;
  severity?: PatternSeverity;
  /** 0-1. Omit to use the source's default. */
  confidence?: number;
  /** Skip the pgvector mirror — for bulk paths that mirror separately. */
  skipVectorMirror?: boolean;
}

export type RecordPatternResult =
  | { ok: true; pattern: ExecutionPattern; occurrences: number }
  | { ok: false; reason: "unrecognized" | "write_failed" };

/**
 * How much to trust an observation, by where it came from.
 *
 * Onboarding is the user stating it outright, so it starts highest. A keyword
 * match in chat is the weakest signal and has to earn confidence through
 * repetition.
 */
const SOURCE_CONFIDENCE: Record<PatternSource, number> = {
  onboarding: 0.85,
  confidence_qa: 0.85,
  reflection: 0.75,
  extraction: 0.7,
  chat: 0.65,
};

/** Each repeat mention adds this much, up to the ceiling. */
const REPEAT_BOOST = 0.03;
const CONFIDENCE_CEILING = 0.98;

/**
 * Record one observation of a pattern.
 *
 * Idempotent per (user, pattern): the first observation creates the row, each
 * later one increments `occurrences` and nudges confidence up. Returns a
 * result rather than throwing, because every caller is on a background path
 * where a failure should be logged and stepped over, not propagated into the
 * user's request.
 */
export async function recordPattern(
  supabase: SupabaseClient,
  userId: string,
  input: RecordPatternInput
): Promise<RecordPatternResult> {
  const pattern = normalizePattern(input.pattern);

  if (!pattern) {
    // Deliberately not substituting a default. The planner changes its
    // behaviour based on this value, so a wrong pattern is worse than none.
    logger.debug("[patterns] unrecognized pattern, not recorded", {
      userId,
      raw: input.pattern,
      source: input.source,
    });
    return { ok: false, reason: "unrecognized" };
  }

  const now = new Date().toISOString();

  try {
    const { data: existing } = await supabase
      .from("execution_patterns")
      .select("id, occurrences, confidence, evidence_count")
      .eq("user_id", userId)
      .eq("pattern", pattern)
      .maybeSingle();

    const occurrences = (existing?.occurrences ?? 0) + 1;
    const evidenceCount = (existing?.evidence_count ?? 0) + 1;

    const confidence = Math.min(
      CONFIDENCE_CEILING,
      input.confidence ??
        (existing
          ? (existing.confidence ?? SOURCE_CONFIDENCE[input.source]) + REPEAT_BOOST
          : SOURCE_CONFIDENCE[input.source])
    );

    // Computed at write time rather than left to the column default, so a
    // pattern ranks correctly before the nightly re-score touches it.
    const influence = computePatternInfluence({
      confidence,
      occurrences,
      lastMentionedAt: now,
      status: "active",
    });

    const row = {
      user_id: userId,
      pattern,
      trigger: input.trigger ?? null,
      behavioral_impact:
        input.behavioralImpact?.trim() || `Observed in ${input.source}`,
      // NOT NULL on the table, so these always carry a value.
      frequency: input.frequency ?? frequencyFor(occurrences),
      severity: input.severity ?? "medium",
      confidence,
      influence_score: influence,
      occurrences,
      evidence_count: evidenceCount,
      last_detected: now,
      last_mentioned_at: now,
      status: "active",
      source: input.source,
    };

    // One statement. The unique index from migration 045 is what makes this
    // safe under concurrency; before it, two turns could both insert.
    const { error } = await supabase
      .from("execution_patterns")
      .upsert(row, { onConflict: "user_id,pattern" });

    if (error) {
      logger.error("[patterns] write failed", error, { userId, pattern, source: input.source });
      return { ok: false, reason: "write_failed" };
    }

    if (!input.skipVectorMirror) {
      mirrorPatternToVector({
        userId,
        pattern,
        evidenceCount,
        influenceScore: influence,
        behavioralImpact: row.behavioral_impact,
      });
    }

    return { ok: true, pattern, occurrences };
  } catch (error) {
    logger.error("[patterns] unexpected failure", error, { userId, source: input.source });
    return { ok: false, reason: "write_failed" };
  }
}

/**
 * Frequency implied by how often we have seen it.
 *
 * Previously each caller picked a literal — the same observation was recorded
 * as "frequent" by one path and "occasional" by another.
 */
function frequencyFor(occurrences: number): PatternFrequency {
  if (occurrences >= 10) return "constant";
  if (occurrences >= 4) return "frequent";
  if (occurrences >= 2) return "occasional";
  return "rare";
}

/**
 * Narrow a model-supplied frequency onto the allowed set.
 *
 * These values arrive from an LLM and reach a CHECK-constrained column. An
 * answer of "very often" would have failed the insert; it now falls back.
 */
export function asFrequency(value: unknown): PatternFrequency | undefined {
  return value === "rare" || value === "occasional" || value === "frequent" || value === "constant"
    ? value
    : undefined;
}

/** Narrow a model-supplied severity onto the allowed set. */
export function asSeverity(value: unknown): PatternSeverity | undefined {
  return value === "low" || value === "medium" || value === "high" ? value : undefined;
}

/** Record several observations, skipping any the vocabulary doesn't cover. */
export async function recordPatterns(
  supabase: SupabaseClient,
  userId: string,
  inputs: RecordPatternInput[]
): Promise<{ recorded: ExecutionPattern[]; skipped: string[] }> {
  const recorded: ExecutionPattern[] = [];
  const skipped: string[] = [];

  // Sequential on purpose: two observations of the same pattern in one batch
  // would otherwise race each other through the read-then-upsert.
  for (const input of inputs) {
    const result = await recordPattern(supabase, userId, input);
    if (result.ok) recorded.push(result.pattern);
    else skipped.push(input.pattern);
  }

  return { recorded, skipped };
}
