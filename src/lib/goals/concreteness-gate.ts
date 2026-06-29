import { normalizeGoalTitle } from "@/lib/goals/title-quality";

/** Vision language — direction, not an executable goal. */
const VISION_PATTERNS = [
  /\bexcel\b/i,
  /\bbe successful\b/i,
  /\bachieve in life\b/i,
  /\bbecome great\b/i,
  /\bimprove myself\b/i,
  /\bbetter person\b/i,
  /\breach my potential\b/i,
  /\bbe the best\b/i,
  /\bsuccessful in\b/i,
  /\bin my surrounding/i,
  /\bin life\b/i,
  /\bgrow as a person\b/i,
  /\bbecome (a )?better\b/i,
  /\bachieve more\b/i,
  /\bdo well\b/i,
  /\bmake it in life\b/i,
  /\bbe better\b/i,
  /\bimprove everything\b/i,
  /^grow$/i,
  /^success$/i,
  /^greatness$/i,
];

const VAGUE_NOUNS =
  /^(success|growth|greatness|improvement|excellence|happiness|freedom|life|myself|everything|something better)$/i;

/** Domain nouns — accept goal direction even before sharpening. */
export const DOMAIN_NOUN_PATTERN =
  /\b(business|fitness|income|agency|product|clients?|customers?|saas|startup|compan(y|ies)|revenue|weight|portfolio|exam|job|career|app|website|brand|course|certification|finance|consulting|marketplace|mvp|beta|engineer|freelanc(e|ing)|health|muscle|sales|marketing)\b/i;

export type GoalKind = "concrete" | "vision";

export interface GoalAssessment {
  kind: GoalKind;
  title: string;
  valid: boolean;
  message?: string;
  suggestions: string[];
}

const SHARPEN_SUGGESTIONS = [
  "Build a finance agency",
  "Launch my SaaS product",
  "Get my first 5 clients",
  "Reach 15% body fat",
];

export function hasDomainNoun(raw: string): boolean {
  return DOMAIN_NOUN_PATTERN.test(raw.trim());
}

export function isVagueVision(raw: string): boolean {
  const t = raw.trim().toLowerCase();
  if (t.length < 4) return true;
  if (hasDomainNoun(raw)) return false;
  if (VAGUE_NOUNS.test(t)) return true;
  if (VISION_PATTERNS.some((p) => p.test(t))) return true;
  if (/^(to|be|become|get|achieve|excel|improve)\s+/i.test(t) && t.split(/\s+/).length <= 6) {
    return true;
  }
  return false;
}

export function isConcreteGoalTitle(raw: string): boolean {
  const normalized = normalizeGoalTitle(raw);
  if (isVagueVision(normalized) || isVagueVision(raw)) return false;
  if (normalized.length < 4) return false;
  const words = normalized.split(/\s+/);
  if (words.length > 10) return false;
  const hasActionOrMetric =
    /\b(launch|build|reach|lose|gain|get|pass|hire|ship|complete|finish|first \d|\d+\s*(kg|lb|%|user|client|customer))/i.test(
      normalized
    );
  const hasProperNoun = /\b(menai|saas|mvp|beta|upsc|agency)\b/i.test(normalized);
  return hasActionOrMetric || hasProperNoun || (words.length <= 5 && !isVagueVision(normalized));
}

export function suggestGoals(context: {
  directions?: string[];
  buildingWhat?: string | null;
  rawInput?: string;
}): string[] {
  const dirs = context.directions || [];
  const raw = (context.rawInput || "").toLowerCase();
  const suggestions: string[] = [];

  if (dirs.includes("business") || /agency|saas|startup|business|client/.test(raw)) {
    suggestions.push("Build a finance agency", "Launch my SaaS product", "Get my first 5 clients");
  }
  if (dirs.includes("fitness") || dirs.includes("health") || /fit|gym|weight|fat/.test(raw)) {
    suggestions.push("Reach 15% body fat", "Lose 5 kg", "Complete 30 workouts");
  }
  if (dirs.includes("finance") || /income|money|wealth/.test(raw)) {
    suggestions.push("Increase monthly income by 20%", "Save $10k emergency fund");
  }
  if (dirs.includes("career") || /job|engineer|hire/.test(raw)) {
    suggestions.push("Land software engineering role", "Complete portfolio");
  }
  if (context.buildingWhat) {
    suggestions.unshift(`Launch ${context.buildingWhat}`);
  }

  const unique = [...new Set(suggestions.length ? suggestions : SHARPEN_SUGGESTIONS)];
  return unique.slice(0, 4);
}

/** Gate before creating execution goals or milestones. */
export function assessGoalInput(
  raw: string,
  context?: { directions?: string[]; buildingWhat?: string | null }
): GoalAssessment {
  const title = normalizeGoalTitle(raw);
  const suggestions = suggestGoals({
    directions: context?.directions,
    buildingWhat: context?.buildingWhat,
    rawInput: raw,
  });

  if (hasDomainNoun(raw) || hasDomainNoun(title)) {
    return { kind: "concrete", title, valid: true, suggestions: [] };
  }

  if (isConcreteGoalTitle(title)) {
    return { kind: "concrete", title, valid: true, suggestions: [] };
  }

  if (isVagueVision(raw) || isVagueVision(title)) {
    return {
      kind: "vision",
      title,
      valid: false,
      message:
        "That sounds like a direction rather than a concrete goal. Pick something you can finish in 30–90 days with a clear done state.",
      suggestions,
    };
  }

  return {
    kind: "vision",
    title,
    valid: false,
    message:
      "Add a specific domain or outcome — e.g. business, fitness, income, or a measurable target.",
    suggestions,
  };
}

export function goalNeedsStage(title: string, lifeArea?: string | null): boolean {
  const corpus = `${title} ${lifeArea || ""}`.toLowerCase();
  return /agency|finance|saas|startup|business|client|consulting|marketplace|product|mvp/.test(
    corpus
  );
}
