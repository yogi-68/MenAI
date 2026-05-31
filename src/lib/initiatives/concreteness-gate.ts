import { normalizeInitiativeTitle } from "@/lib/initiatives/title-quality";

/** Vision language — direction, not an executable initiative. */
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
  /^grow$/i,
  /^success$/i,
  /^greatness$/i,
];

const VAGUE_NOUNS =
  /^(success|growth|greatness|improvement|excellence|happiness|freedom|life|myself|everything|something better)$/i;

export type InitiativeKind = "concrete" | "vision";

export interface InitiativeAssessment {
  kind: InitiativeKind;
  title: string;
  valid: boolean;
  message?: string;
  suggestions: string[];
}

const DEFAULT_SUGGESTIONS = [
  "Build my finance agency",
  "Launch my product",
  "Increase my income",
  "Improve my fitness",
  "Reach 15% body fat",
  "Get my first 5 clients",
];

export function isVagueVision(raw: string): boolean {
  const t = raw.trim().toLowerCase();
  if (t.length < 4) return true;
  if (VAGUE_NOUNS.test(t)) return true;
  if (VISION_PATTERNS.some((p) => p.test(t))) return true;
  if (/^(to|be|become|get|achieve|excel)\s+/i.test(t) && t.split(/\s+/).length <= 6) {
    return true;
  }
  return false;
}

export function isConcreteInitiativeTitle(raw: string): boolean {
  const normalized = normalizeInitiativeTitle(raw);
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

export function suggestInitiatives(context: {
  directions?: string[];
  buildingWhat?: string | null;
  rawInput?: string;
}): string[] {
  const dirs = context.directions || [];
  const raw = (context.rawInput || "").toLowerCase();
  const suggestions: string[] = [];

  if (dirs.includes("business") || /agency|saas|startup|business|client/.test(raw)) {
    suggestions.push("Build my finance agency", "Launch my product", "Get my first 5 clients");
  }
  if (dirs.includes("fitness") || dirs.includes("health") || /fit|gym|weight|fat/.test(raw)) {
    suggestions.push("Reach 15% body fat", "Lose 5 kg", "Complete 30 workouts");
  }
  if (dirs.includes("finance") || /income|money|wealth/.test(raw)) {
    suggestions.push("Increase my income", "Save $10k emergency fund");
  }
  if (dirs.includes("career") || /job|engineer|hire/.test(raw)) {
    suggestions.push("Land software engineering role", "Complete portfolio");
  }
  if (context.buildingWhat) {
    suggestions.unshift(`Launch ${context.buildingWhat}`);
  }

  const unique = [...new Set(suggestions.length ? suggestions : DEFAULT_SUGGESTIONS)];
  return unique.slice(0, 4);
}

/** Gate before creating initiatives or milestones. */
export function assessInitiativeInput(
  raw: string,
  context?: { directions?: string[]; buildingWhat?: string | null }
): InitiativeAssessment {
  const title = normalizeInitiativeTitle(raw);
  const suggestions = suggestInitiatives({
    directions: context?.directions,
    buildingWhat: context?.buildingWhat,
    rawInput: raw,
  });

  if (isVagueVision(raw) || isVagueVision(title) || !isConcreteInitiativeTitle(title)) {
    return {
      kind: "vision",
      title,
      valid: false,
      message:
        "That sounds like a direction rather than a concrete initiative. Pick something you can finish in 30–90 days with a clear done state.",
      suggestions,
    };
  }

  return { kind: "concrete", title, valid: true, suggestions: [] };
}

export function initiativeNeedsStage(title: string, lifeArea?: string | null): boolean {
  const corpus = `${title} ${lifeArea || ""}`.toLowerCase();
  return /agency|finance|saas|startup|business|client|consulting|marketplace|product|mvp/.test(
    corpus
  );
}
