import type { SupabaseClient } from "@supabase/supabase-js";

export type LifeAreaKey =
  | "business"
  | "finance"
  | "health"
  | "learning"
  | "career"
  | "relationships"
  | "personal";

const AREA_ALIASES: Record<string, LifeAreaKey> = {
  business: "business",
  finance: "finance",
  finances: "finance",
  financial: "finance",
  fitness: "health",
  health: "health",
  learning: "learning",
  study: "learning",
  career: "career",
  relationships: "relationships",
  family: "relationships",
  personal: "personal",
  creativity: "personal",
};

function normalizeArea(raw: string | null | undefined): LifeAreaKey | null {
  if (!raw) return null;
  const key = raw.toLowerCase().replace(/\s+/g, "_");
  return AREA_ALIASES[key] ?? (key in AREA_ALIASES ? (key as LifeAreaKey) : null);
}

function bump(weights: Record<string, number>, area: LifeAreaKey, amount: number) {
  weights[area] = (weights[area] ?? 0) + amount;
}

/** Merge stored weights with signals from goals, initiatives, identity, chat. */
export async function computeLifeAreaWeights(
  supabase: SupabaseClient,
  userId: string
): Promise<Record<LifeAreaKey, number>> {
  const [profileRes, goalsRes, initiativesRes, signalsRes] = await Promise.all([
    supabase.from("profiles").select("life_area_weights").eq("id", userId).maybeSingle(),
    supabase.from("goals").select("category, title").eq("user_id", userId).eq("status", "active"),
    supabase
      .from("initiatives")
      .select("life_area, title")
      .eq("user_id", userId)
      .eq("status", "active"),
    supabase
      .from("identity_signals")
      .select("description, long_term_direction")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(20),
  ]);

  const raw: Record<string, number> = {
    ...(profileRes.data?.life_area_weights as Record<string, number> | null),
  };

  for (const g of goalsRes.data || []) {
    const area = normalizeArea(g.category) || inferAreaFromText(g.title);
    if (area) bump(raw, area, 0.15);
  }

  for (const i of initiativesRes.data || []) {
    const area = normalizeArea(i.life_area) || inferAreaFromText(i.title);
    if (area) bump(raw, area, 0.35);
  }

  for (const s of signalsRes.data || []) {
    const text = `${s.description} ${s.long_term_direction || ""}`;
    const area = inferAreaFromText(text);
    if (area) bump(raw, area, 0.12);
  }

  return normalizeWeights(raw);
}

export function inferAreaFromText(text: string): LifeAreaKey | null {
  const t = text.toLowerCase();
  if (/business|saas|startup|agency|client|product|mvp/.test(t)) return "business";
  if (/finance|income|wealth|invest|money/.test(t)) return "finance";
  if (/fitness|gym|workout|health|weight|fat|train/.test(t)) return "health";
  if (/learn|study|exam|upsc|course/.test(t)) return "learning";
  if (/career|job|promotion|hire/.test(t)) return "career";
  if (/relationship|family|partner/.test(t)) return "relationships";
  return null;
}

export function normalizeWeights(raw: Record<string, number>): Record<LifeAreaKey, number> {
  const keys: LifeAreaKey[] = [
    "business",
    "finance",
    "health",
    "learning",
    "career",
    "relationships",
    "personal",
  ];
  const filtered: Record<string, number> = {};
  for (const k of keys) {
    if ((raw[k] ?? 0) > 0) filtered[k] = raw[k];
  }
  const total = Object.values(filtered).reduce((s, v) => s + v, 0);
  if (total === 0) {
    return { business: 0.5, finance: 0.2, health: 0.15, learning: 0.05, career: 0.05, relationships: 0.025, personal: 0.025 };
  }
  const out = {} as Record<LifeAreaKey, number>;
  for (const k of keys) {
    out[k] = Math.round(((filtered[k] ?? 0) / total) * 100) / 100;
  }
  return out;
}

/** Persist updated weights after chat/onboarding signals. */
export async function bumpLifeAreaWeight(
  supabase: SupabaseClient,
  userId: string,
  area: LifeAreaKey,
  delta = 0.1
): Promise<Record<LifeAreaKey, number>> {
  const current = await computeLifeAreaWeights(supabase, userId);
  current[area] = (current[area] ?? 0) + delta;
  const normalized = normalizeWeights(current as unknown as Record<string, number>);
  await supabase.from("profiles").update({ life_area_weights: normalized }).eq("id", userId);
  return normalized;
}

export function formatLifeAreaWeightsForPrompt(weights: Record<LifeAreaKey, number>): string[] {
  return Object.entries(weights)
    .filter(([, w]) => w >= 0.08)
    .sort((a, b) => b[1] - a[1])
    .map(([area, w]) => `${area}: ${Math.round(w * 100)}% of today's plan`);
}

export function formatLifeAreaPlanStructure(weights: Record<LifeAreaKey, number>): string {
  const lines = formatLifeAreaWeightsForPrompt(weights);
  return `LIFE AREA BALANCE (mandatory — distribute tasks across areas, not one domain only):
${lines.join("\n")}
- Generate at least ONE task per area with weight >= 15%
- Label each task with its life area in whyItMatters
- Current focus initiative gets the largest share but NEVER 100% unless only one area exists`;
}
