export const IDENTITY_DIMENSION_IDS = [
  "direction",
  "goals",
  "execution_style",
  "constraints",
  "motivations",
  "environment",
  "decision_style",
  "risk_profile",
  "learning_style",
  "planning_baseline",
] as const;

export type IdentityDimensionId = (typeof IDENTITY_DIMENSION_IDS)[number];

export type IdentityCoverageMap = Record<IdentityDimensionId, number>;

export const IDENTITY_DIMENSION_LABELS: Record<IdentityDimensionId, string> = {
  direction: "Direction",
  goals: "Goals",
  execution_style: "Execution style",
  constraints: "Constraints",
  motivations: "Motivations",
  environment: "Environment",
  decision_style: "Decision style",
  risk_profile: "Risk profile",
  learning_style: "Learning style",
  planning_baseline: "Planning baseline",
};

/** Plain-language labels for user-facing UI (no percentages). */
export const IDENTITY_DIMENSION_PLAIN: Record<IdentityDimensionId, string> = {
  direction: "Your long-term direction",
  goals: "Which goals matter most right now",
  execution_style: "How you work best",
  constraints: "Your biggest constraints",
  motivations: "What's driving this goal",
  environment: "Your daily environment and schedule",
  decision_style: "How you make decisions",
  risk_profile: "Your risk tolerance",
  learning_style: "How you learn best",
  planning_baseline: "Your current baseline numbers",
};

export function missingKnowledgeLabels(
  coverage: IdentityCoverageMap,
  threshold = 30
): string[] {
  return IDENTITY_DIMENSION_IDS.filter((id) => (coverage[id] ?? 0) < threshold)
    .sort((a, b) => (coverage[a] ?? 0) - (coverage[b] ?? 0))
    .map((id) => IDENTITY_DIMENSION_PLAIN[id])
    .slice(0, 5);
}

export type WhoAmIStatementTag = "verified" | "strong_inference" | "unknown";

export interface WhoAmIStatement {
  tag: WhoAmIStatementTag;
  text: string;
  evidence: string[];
}

export interface IdentityProfileAnswer {
  dimension: IdentityDimensionId;
  value: string;
  answeredAt: string;
}

export interface IdentityProfileStore {
  answers: Record<string, IdentityProfileAnswer>;
  interviewAskedToday?: string[];
  interviewDate?: string;
  lastCoverage?: IdentityCoverageMap;
  lastOverallCoverage?: number;
}

export function emptyIdentityCoverage(): IdentityCoverageMap {
  return Object.fromEntries(
    IDENTITY_DIMENSION_IDS.map((id) => [id, 0])
  ) as IdentityCoverageMap;
}

export function averageCoverage(coverage: IdentityCoverageMap): number {
  const values = IDENTITY_DIMENSION_IDS.map((id) => coverage[id] ?? 0);
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}
