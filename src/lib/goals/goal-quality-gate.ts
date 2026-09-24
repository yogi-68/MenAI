import { getOpenAI } from "@/lib/ai/openai";
import { FAST_MODEL } from "@/lib/ai/models";
import {
  assessGoalInput,
  hasDomainNoun,
  isConcreteGoalTitle,
  type GoalAssessment,
} from "@/lib/goals/concreteness-gate";
import { normalizeGoalTitle } from "@/lib/goals/title-quality";

export type GoalQuality = "vision" | "broad" | "weak" | "strong";

export interface SharpenOption {
  value: string;
  label: string;
  resultTitle: string;
}

export interface FullGoalAssessment extends GoalAssessment {
  quality: GoalQuality;
  needsSharpening: boolean;
  sharpenPrompt?: string;
  sharpenOptions?: SharpenOption[];
}

const BROAD_PATTERNS: Array<{ re: RegExp; key: string }> = [
  { re: /\bbuild (a |my )?business\b/i, key: "business_build" },
  { re: /\bstart (a |my )?business\b/i, key: "business_build" },
  { re: /\bcreate (a |my )?business\b/i, key: "business_build" },
];

const WEAK_PATTERNS: Array<{ re: RegExp; key: string }> = [
  { re: /\bincrease (my )?income\b/i, key: "income" },
  { re: /\b(make|earn) more money\b/i, key: "income" },
  { re: /\bbuild wealth\b/i, key: "wealth" },
  { re: /\bfinancial freedom\b/i, key: "wealth" },
  { re: /\bimprove (my )?fitness\b/i, key: "fitness" },
  { re: /\bget (healthier|fit)\b/i, key: "fitness" },
  { re: /\blose weight\b/i, key: "fitness" },
  { re: /\bgrow (my )?business\b/i, key: "business" },
  { re: /\bbe more productive\b/i, key: "productivity" },
  { re: /\bget a (better )?job\b/i, key: "career" },
  { re: /\bpass (the )?exam\b/i, key: "learning" },
];

const BROAD_SHARPEN_OPTIONS: Record<string, SharpenOption[]> = {
  business_build: [
    { value: "finance_agency", label: "Finance agency", resultTitle: "Build a finance agency" },
    { value: "product_saas", label: "Product / SaaS", resultTitle: "Build a product SaaS business" },
    { value: "service", label: "Service business", resultTitle: "Build a service business" },
    { value: "other", label: "Other", resultTitle: "Build a focused business" },
  ],
};

const SHARPEN_OPTIONS: Record<string, SharpenOption[]> = {
  income: [
    { value: "agency", label: "Finance agency", resultTitle: "Build a finance agency" },
    { value: "freelance", label: "Freelancing", resultTitle: "Land 2 freelance clients" },
    { value: "promotion", label: "Job promotion", resultTitle: "Get promoted this quarter" },
    { value: "business", label: "New business", resultTitle: "Launch MVP and get 5 users" },
  ],
  wealth: [
    { value: "agency", label: "Finance agency", resultTitle: "Build a finance agency" },
    { value: "investing", label: "Investing", resultTitle: "Build a $10k investment portfolio" },
    { value: "savings", label: "Savings", resultTitle: "Save a $5k emergency fund" },
  ],
  fitness: [
    { value: "fat_loss", label: "Lose body fat", resultTitle: "Reach 15% body fat" },
    { value: "strength", label: "Build strength", resultTitle: "Complete 30 strength workouts" },
    { value: "consistency", label: "Build habit", resultTitle: "Work out 4x/week for 30 days" },
  ],
  business: [
    { value: "clients", label: "First clients", resultTitle: "Get first 3 paying clients" },
    { value: "mvp", label: "Launch product", resultTitle: "Launch MVP and get 10 users" },
    { value: "agency", label: "Finance agency", resultTitle: "Build a finance agency" },
  ],
  career: [
    { value: "role", label: "Land new role", resultTitle: "Land a software engineering role" },
    { value: "promotion", label: "Promotion", resultTitle: "Get promoted this quarter" },
    { value: "portfolio", label: "Portfolio", resultTitle: "Finish portfolio and apply to 20 roles" },
  ],
  learning: [
    { value: "exam", label: "Pass exam", resultTitle: "Pass UPSC prelims" },
    { value: "skill", label: "Learn skill", resultTitle: "Complete certification course" },
  ],
  productivity: [
    { value: "focus", label: "One goal", resultTitle: "Ship one project in 30 days" },
    { value: "habit", label: "Daily execution", resultTitle: "Complete 20 planned tasks in 30 days" },
  ],
};

const SHARPEN_PROMPTS: Record<string, string> = {
  business_build: "What type of business are you building?",
  income: "How are you planning to increase income?",
  wealth: "What's your main path to building wealth right now?",
  fitness: "What does fitness success look like in the next 90 days?",
  business: "What's the concrete business outcome you're chasing?",
  career: "What career move are you actually trying to make?",
  learning: "What exam or skill are you trying to complete?",
  productivity: "What one thing needs to move forward?",
};

function detectBroadKey(raw: string): string | null {
  for (const { re, key } of BROAD_PATTERNS) {
    if (re.test(raw)) return key;
  }
  return null;
}

function detectWeakKey(raw: string): string | null {
  if (detectBroadKey(raw)) return null;
  for (const { re, key } of WEAK_PATTERNS) {
    if (re.test(raw)) return key;
  }
  const t = raw.trim().toLowerCase();
  if (isConcreteGoalTitle(raw)) return null;
  if (hasDomainNoun(raw)) return null;
  if (t.split(/\s+/).length <= 4 && !/\d/.test(t)) return "productivity";
  return null;
}

export function isWeakGoal(raw: string): boolean {
  return detectWeakKey(raw) !== null || detectBroadKey(raw) !== null;
}

export function sharpenGoal(weakKey: string, optionValue: string): string | null {
  const options = SHARPEN_OPTIONS[weakKey] || BROAD_SHARPEN_OPTIONS[weakKey];
  const hit = options?.find((o) => o.value === optionValue);
  return hit?.resultTitle ?? null;
}

/** Full gate: block visions, flag broad/weak goals for sharpening. */
export function assessGoalQuality(
  raw: string,
  context?: { directions?: string[]; buildingWhat?: string | null }
): FullGoalAssessment {
  const base = assessGoalInput(raw, context);
  const title = normalizeGoalTitle(raw);

  if (!base.valid) {
    return { ...base, quality: "vision", needsSharpening: false };
  }

  const broadKey = detectBroadKey(raw) || detectBroadKey(title);
  if (broadKey) {
    return {
      ...base,
      quality: "broad",
      needsSharpening: true,
      sharpenPrompt: SHARPEN_PROMPTS[broadKey] || "What specific outcome are you trying to reach?",
      sharpenOptions: BROAD_SHARPEN_OPTIONS[broadKey],
      message: "Got it. Let's make this specific so Mettle can plan precisely.",
    };
  }

  if (isConcreteGoalTitle(title) && !detectWeakKey(raw)) {
    return { ...base, quality: "strong", needsSharpening: false };
  }

  const weakKey = detectWeakKey(raw) || detectWeakKey(title);
  if (weakKey) {
    return {
      ...base,
      quality: "weak",
      needsSharpening: true,
      sharpenPrompt: SHARPEN_PROMPTS[weakKey] || "What specific outcome are you trying to reach?",
      sharpenOptions: SHARPEN_OPTIONS[weakKey],
      message: "Got it. Let's make this specific so Mettle can plan precisely.",
    };
  }

  if (hasDomainNoun(raw) || hasDomainNoun(title)) {
    return { ...base, quality: "strong", needsSharpening: false };
  }

  return { ...base, quality: "strong", needsSharpening: false };
}

/** Optional LLM sharpen when heuristic gate flags a vague goal (onboarding). */
export async function assessGoalWithLLM(
  raw: string
): Promise<{
  sharpenPrompt: string;
  sharpenOptions: SharpenOption[];
  exampleTitle?: string;
  message?: string;
} | null> {
  try {
    const openai = getOpenAI();
    const response = await openai.chat.completions.create({
      model: FAST_MODEL,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'Return JSON: { "sharpenPrompt": string, "exampleTitle": string, "message": string, "options": [{ "value": string, "label": string, "resultTitle": string }] }. exampleTitle is one concrete rewrite. resultTitle must be a full goal title (not a fragment).',
        },
        {
          role: "user",
          content: `Goal title: "${raw.trim()}"`,
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content) as {
      sharpenPrompt?: string;
      exampleTitle?: string;
      message?: string;
      options?: Array<{ value?: string; label?: string; resultTitle?: string }>;
    };

    const sharpenOptions = (parsed.options ?? [])
      .filter((o) => o.resultTitle?.trim())
      .slice(0, 5)
      .map((o, i) => ({
        value: o.value?.trim() || `opt_${i}`,
        label: o.label?.trim() || o.resultTitle!.trim(),
        resultTitle: o.resultTitle!.trim(),
      }));

    if (sharpenOptions.length === 0) return null;

    return {
      sharpenPrompt: parsed.sharpenPrompt?.trim() || "What specific outcome are you trying to reach?",
      sharpenOptions,
      exampleTitle: parsed.exampleTitle?.trim() || sharpenOptions[0]?.resultTitle,
      message:
        parsed.message?.trim() ||
        "Got it. Let's make this specific so Mettle can plan precisely.",
    };
  } catch {
    return null;
  }
}
