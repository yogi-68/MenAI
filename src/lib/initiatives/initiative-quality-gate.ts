import {
  assessInitiativeInput,
  isConcreteInitiativeTitle,
  type InitiativeAssessment,
} from "@/lib/initiatives/concreteness-gate";
import { normalizeInitiativeTitle } from "@/lib/initiatives/title-quality";

export type InitiativeQuality = "vision" | "weak" | "strong";

export interface SharpenOption {
  value: string;
  label: string;
  resultTitle: string;
}

export interface FullInitiativeAssessment extends InitiativeAssessment {
  quality: InitiativeQuality;
  needsSharpening: boolean;
  sharpenPrompt?: string;
  sharpenOptions?: SharpenOption[];
}

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

const SHARPEN_OPTIONS: Record<string, SharpenOption[]> = {
  income: [
    { value: "agency", label: "Finance agency", resultTitle: "Get first 3 finance agency clients" },
    { value: "freelance", label: "Freelancing", resultTitle: "Land 2 freelance clients" },
    { value: "promotion", label: "Job promotion", resultTitle: "Get promoted this quarter" },
    { value: "business", label: "New business", resultTitle: "Launch MVP and get 5 users" },
    { value: "investing", label: "Investing", resultTitle: "Deploy first $5k investment plan" },
  ],
  wealth: [
    { value: "agency", label: "Finance agency", resultTitle: "Get first 3 finance agency clients" },
    { value: "investing", label: "Investing", resultTitle: "Build $10k investment portfolio" },
    { value: "savings", label: "Savings", resultTitle: "Save $5k emergency fund" },
    { value: "business", label: "New business", resultTitle: "Launch product and reach first revenue" },
  ],
  fitness: [
    { value: "fat_loss", label: "Lose body fat", resultTitle: "Reach 15% body fat" },
    { value: "strength", label: "Build strength", resultTitle: "Complete 30 strength workouts" },
    { value: "consistency", label: "Build habit", resultTitle: "Work out 4x/week for 30 days" },
  ],
  business: [
    { value: "clients", label: "First clients", resultTitle: "Get first 3 paying clients" },
    { value: "mvp", label: "Launch product", resultTitle: "Launch MVP and get 10 users" },
    { value: "agency", label: "Finance agency", resultTitle: "Sign first finance agency client" },
  ],
  career: [
    { value: "role", label: "Land new role", resultTitle: "Land software engineering role" },
    { value: "promotion", label: "Promotion", resultTitle: "Get promoted this quarter" },
    { value: "portfolio", label: "Portfolio", resultTitle: "Finish portfolio and apply to 20 roles" },
  ],
  learning: [
    { value: "exam", label: "Pass exam", resultTitle: "Pass UPSC prelims" },
    { value: "skill", label: "Learn skill", resultTitle: "Complete certification course" },
  ],
  productivity: [
    { value: "focus", label: "One initiative", resultTitle: "Ship one project in 30 days" },
    { value: "habit", label: "Daily execution", resultTitle: "Complete 20 planned tasks in 30 days" },
  ],
};

const SHARPEN_PROMPTS: Record<string, string> = {
  income: "How are you planning to increase income?",
  wealth: "What's your main path to building wealth right now?",
  fitness: "What does fitness success look like in the next 90 days?",
  business: "What's the concrete business outcome you're chasing?",
  career: "What career move are you actually trying to make?",
  learning: "What exam or skill are you trying to complete?",
  productivity: "What one thing needs to move forward?",
};

function detectWeakKey(raw: string): string | null {
  for (const { re, key } of WEAK_PATTERNS) {
    if (re.test(raw)) return key;
  }
  const t = raw.trim().toLowerCase();
  if (isConcreteInitiativeTitle(raw)) return null;
  if (t.split(/\s+/).length <= 4 && !/\d/.test(t)) return "productivity";
  return null;
}

export function isWeakInitiative(raw: string): boolean {
  return detectWeakKey(raw) !== null;
}

export function sharpenInitiative(weakKey: string, optionValue: string): string | null {
  const options = SHARPEN_OPTIONS[weakKey];
  const hit = options?.find((o) => o.value === optionValue);
  return hit?.resultTitle ?? null;
}

/** Full gate: block visions, flag weak initiatives for sharpening. */
export function assessInitiativeQuality(
  raw: string,
  context?: { directions?: string[]; buildingWhat?: string | null }
): FullInitiativeAssessment {
  const base = assessInitiativeInput(raw, context);
  const title = normalizeInitiativeTitle(raw);

  if (!base.valid) {
    return { ...base, quality: "vision", needsSharpening: false };
  }

  const weakKey = detectWeakKey(raw) || detectWeakKey(title);
  if (weakKey) {
    return {
      ...base,
      quality: "weak",
      needsSharpening: true,
      sharpenPrompt: SHARPEN_PROMPTS[weakKey] || "What specific outcome are you trying to reach?",
      sharpenOptions: SHARPEN_OPTIONS[weakKey] || base.suggestions.map((s) => ({
        value: s,
        label: s,
        resultTitle: s,
      })),
      message:
        "Valid direction — but too vague to plan from. Pick a concrete path so MenAI can build real milestones.",
    };
  }

  return { ...base, quality: "strong", needsSharpening: false };
}
