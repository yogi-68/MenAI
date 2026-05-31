import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fallbackInterviewStep,
  MAX_INTERVIEW_QUESTIONS_PER_DAY,
  runAiIdentityInterviewStep,
  type AiInterviewQuestion,
} from "@/lib/plans/ai-identity-interview";
import {
  getIdentityAskedToday,
  loadIdentityProfile,
  saveIdentityCoverage,
} from "@/lib/plans/identity-profile-store";
import { buildEvidenceBundle } from "@/lib/user-model/evidence-bundle";
import type { EvidenceBundle } from "@/lib/user-model/evidence-bundle";
import { computeBaselineCoverage } from "@/lib/user-model/identity-synthesis";
import {
  averageCoverage,
  emptyIdentityCoverage,
  type IdentityCoverageMap,
  type IdentityDimensionId,
  type IdentityProfileStore,
} from "@/lib/user-model/identity-dimensions";
import { scheduleUserModelRefresh } from "@/lib/user-model/synthesis-engine";

const CACHE_TTL_MS = 5 * 60 * 1000;
const refreshScheduled = new Set<string>();

/** Bump coverage for the dimension just answered — avoids full AI re-score on submit. */
export function bumpCoverageAfterAnswer(
  coverage: IdentityCoverageMap,
  dimension: IdentityDimensionId
): IdentityCoverageMap {
  const out = { ...coverage };
  const bump = dimension === "planning_baseline" ? 30 : 22;
  out[dimension] = Math.min(100, (out[dimension] ?? 0) + bump);
  return out;
}

function minimalBundle(initiativeCount: number): EvidenceBundle {
  return {
    vision: null,
    founderMode: false,
    workStyle: null,
    goals: [],
    initiatives: Array.from({ length: Math.max(1, initiativeCount) }, (_, i) => ({
      id: `stub-${i}`,
      title: "stub",
      description: null,
      lifeArea: null,
      domain: "general",
      targetDate: null,
    })),
    focusInitiativeId: null,
    focusTitle: null,
    focusDomain: "general",
    identitySignals: [],
    patterns: [],
    mentorMemories: [],
    completedTasks7d: 0,
    reflections7d: 0,
    reflectionBlocks: [],
    opportunities: [],
    planContextFields: {},
    identityAnswers: {},
  };
}

function readCachedQuestion(profile: IdentityProfileStore): AiInterviewQuestion | null {
  const q = profile.cachedQuestion;
  const at = profile.cachedQuestionGeneratedAt;
  if (!q || !at) return null;
  if (Date.now() - new Date(at).getTime() > CACHE_TTL_MS) return null;
  if ((profile.interviewAskedToday || []).includes(q.id)) return null;
  return q;
}

export interface FastInterviewStepResult {
  coverage: IdentityCoverageMap;
  overallCoverage: number;
  shouldContinue: boolean;
  question: AiInterviewQuestion | null;
  weakestLabel: string | null;
  stopReason?: string;
  source: "cache" | "fallback";
}

/** Return cached AI question if still valid — no fallback, no OpenAI. */
export async function tryGetCachedInterviewQuestion(
  supabase: SupabaseClient,
  userId: string
): Promise<FastInterviewStepResult | null> {
  const profile = await loadIdentityProfile(supabase, userId);
  const cached = readCachedQuestion(profile);
  if (!cached) return null;

  const coverage = profile.lastCoverage ?? emptyIdentityCoverage();
  return {
    coverage,
    overallCoverage: profile.lastOverallCoverage ?? averageCoverage(coverage),
    shouldContinue: true,
    question: cached,
    weakestLabel: cached.subtitle || cached.prompt,
    source: "cache",
  };
}

/** Instant next question — no OpenAI, no full user model rebuild. */
export async function runFastInterviewStep(
  supabase: SupabaseClient,
  userId: string,
  options?: {
    bumpedDimension?: IdentityDimensionId;
    initiativeCount?: number;
  }
): Promise<FastInterviewStepResult> {
  const profile = await loadIdentityProfile(supabase, userId);
  const askedToday = getIdentityAskedToday(profile);

  const cached = readCachedQuestion(profile);
  if (cached) {
    const coverage = profile.lastCoverage ?? emptyIdentityCoverage();
    return {
      coverage,
      overallCoverage: profile.lastOverallCoverage ?? averageCoverage(coverage),
      shouldContinue: true,
      question: cached,
      weakestLabel: cached.subtitle || cached.prompt,
      source: "cache",
    };
  }

  let coverage =
    profile.lastCoverage ??
    (options?.initiativeCount != null
      ? computeBaselineCoverage(minimalBundle(options.initiativeCount))
      : emptyIdentityCoverage());

  if (options?.bumpedDimension) {
    coverage = bumpCoverageAfterAnswer(coverage, options.bumpedDimension);
    await saveIdentityCoverage(supabase, userId, coverage, averageCoverage(coverage));
  }

  const bundle = minimalBundle(options?.initiativeCount ?? 1);
  const step = fallbackInterviewStep(bundle, { ...profile, lastCoverage: coverage }, askedToday);

  if (step.question && askedToday.includes(step.question.id)) {
    return {
      coverage: step.coverage,
      overallCoverage: step.overallCoverage,
      shouldContinue: false,
      question: null,
      weakestLabel: step.weakestLabel,
      stopReason: step.stopReason,
      source: "fallback",
    };
  }

  return {
    coverage: step.coverage,
    overallCoverage: step.overallCoverage,
    shouldContinue: step.shouldContinue,
    question: step.question,
    weakestLabel: step.weakestLabel,
    stopReason: step.stopReason,
    source: "fallback",
  };
}

/** Debounced user model refresh — at most one scheduled per user per 10s. */
export function scheduleUserModelRefreshOnce(
  supabase: SupabaseClient,
  userId: string
): void {
  if (refreshScheduled.has(userId)) return;
  refreshScheduled.add(userId);
  scheduleUserModelRefresh(supabase, userId);
  setTimeout(() => refreshScheduled.delete(userId), 10_000);
}

/** Background: generate AI question and cache for the next step. */
export function prefetchAiInterviewQuestion(
  supabase: SupabaseClient,
  userId: string
): void {
  void (async () => {
    try {
      const profile = await loadIdentityProfile(supabase, userId);
      const askedToday = getIdentityAskedToday(profile);
      if (askedToday.length >= MAX_INTERVIEW_QUESTIONS_PER_DAY) return;

      const bundle = await buildEvidenceBundle(supabase, userId, profile);
      const interview = await runAiIdentityInterviewStep({
        bundle,
        identityProfile: profile,
        askedToday,
        userId,
      });

      if (!interview.question || !interview.shouldContinue) return;

      const { data } = await supabase
        .from("profiles")
        .select("plan_context")
        .eq("id", userId)
        .maybeSingle();

      const store = (data?.plan_context || {}) as Record<string, unknown>;
      const identityProfile = (store.identityProfile || {}) as IdentityProfileStore;
      store.identityProfile = {
        ...identityProfile,
        cachedQuestion: interview.question,
        cachedQuestionGeneratedAt: new Date().toISOString(),
        lastCoverage: interview.coverage,
        lastOverallCoverage: interview.overallCoverage,
      };

      await supabase
        .from("profiles")
        .update({ plan_context: store, updated_at: new Date().toISOString() })
        .eq("id", userId);

      scheduleUserModelRefreshOnce(supabase, userId);
    } catch (err) {
      console.error("[Interview] prefetch failed:", err);
    }
  })();
}

export function deferBackground(fn: () => void | Promise<void>): void {
  void Promise.resolve().then(fn).catch((err) => {
    console.error("[Interview] background task failed:", err);
  });
}
