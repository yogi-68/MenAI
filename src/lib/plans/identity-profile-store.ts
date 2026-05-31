import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  IdentityCoverageMap,
  IdentityDimensionId,
  IdentityProfileStore,
} from "@/lib/user-model/identity-dimensions";

interface PlanContextRoot {
  byInitiative?: Record<string, unknown>;
  identityProfile?: IdentityProfileStore;
  [key: string]: unknown;
}

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

async function readStore(supabase: SupabaseClient, userId: string): Promise<PlanContextRoot> {
  const { data } = await supabase
    .from("profiles")
    .select("plan_context")
    .eq("id", userId)
    .maybeSingle();
  return (data?.plan_context || {}) as PlanContextRoot;
}

async function writeStore(
  supabase: SupabaseClient,
  userId: string,
  store: PlanContextRoot
): Promise<void> {
  await supabase
    .from("profiles")
    .update({ plan_context: store, updated_at: new Date().toISOString() })
    .eq("id", userId);
}

export async function loadIdentityProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<IdentityProfileStore> {
  const store = await readStore(supabase, userId);
  const raw = store.identityProfile;
  const profile: IdentityProfileStore = {
    answers: raw?.answers || {},
    interviewAskedToday: raw?.interviewAskedToday || [],
    interviewDate: raw?.interviewDate,
    lastCoverage: raw?.lastCoverage,
    lastOverallCoverage: raw?.lastOverallCoverage,
  };
  if (profile.interviewDate !== todayStr()) {
    return { ...profile, interviewAskedToday: [], interviewDate: todayStr() };
  }
  return profile;
}

export async function saveIdentityCoverage(
  supabase: SupabaseClient,
  userId: string,
  coverage: IdentityCoverageMap,
  overallCoverage: number
): Promise<void> {
  const store = await readStore(supabase, userId);
  store.identityProfile = {
    ...(store.identityProfile || { answers: {} }),
    lastCoverage: coverage,
    lastOverallCoverage: overallCoverage,
  };
  await writeStore(supabase, userId, store);
}

export async function saveIdentityAnswer(
  supabase: SupabaseClient,
  userId: string,
  input: {
    questionId: string;
    dimension: IdentityDimensionId;
    value: string;
  }
): Promise<IdentityProfileStore> {
  const store = await readStore(supabase, userId);
  const today = todayStr();
  const current = store.identityProfile || { answers: {} };
  const asked = [...(current.interviewAskedToday || [])];
  if (!asked.includes(input.questionId)) asked.push(input.questionId);

  store.identityProfile = {
    ...current,
    answers: {
      ...(current.answers || {}),
      [input.questionId]: {
        dimension: input.dimension,
        value: input.value,
        answeredAt: new Date().toISOString(),
      },
    },
    interviewAskedToday: asked,
    interviewDate: today,
  };

  await writeStore(supabase, userId, store);
  return store.identityProfile;
}

export async function markIdentityQuestionSkipped(
  supabase: SupabaseClient,
  userId: string,
  questionId: string
): Promise<void> {
  const store = await readStore(supabase, userId);
  const current = store.identityProfile || { answers: {} };
  const asked = [...(current.interviewAskedToday || [])];
  if (!asked.includes(questionId)) asked.push(questionId);
  store.identityProfile = {
    ...current,
    interviewAskedToday: asked,
    interviewDate: todayStr(),
  };
  await writeStore(supabase, userId, store);
}

export function getIdentityAskedToday(profile: IdentityProfileStore): string[] {
  return profile.interviewAskedToday || [];
}
