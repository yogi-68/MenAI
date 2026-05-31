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

/** Internal only — never shown in user UI. */
export const IDENTITY_DIMENSION_PLAIN: Record<IdentityDimensionId, string> = {
  direction: "Your direction",
  goals: "Next milestone",
  execution_style: "What's getting in the way",
  constraints: "Current blockers",
  motivations: "Motivations",
  environment: "Schedule",
  decision_style: "Decision style",
  risk_profile: "Risk profile",
  learning_style: "Learning style",
  planning_baseline: "This week's priority",
};

/** Execution-only gaps — never personality quiz labels. */
export function missingKnowledgeLabels(
  coverage: IdentityCoverageMap,
  threshold = 30
): string[] {
  const executionDims: IdentityDimensionId[] = [
    "direction",
    "goals",
    "constraints",
    "execution_style",
    "planning_baseline",
  ];
  return executionDims
    .filter((id) => (coverage[id] ?? 0) < threshold)
    .sort((a, b) => (coverage[a] ?? 0) - (coverage[b] ?? 0))
    .map((id) => IDENTITY_DIMENSION_PLAIN[id])
    .slice(0, 3);
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
  cachedQuestion?: {
    id: string;
    dimension: IdentityDimensionId;
    prompt: string;
    subtitle?: string;
    inputType: "text" | "number" | "date" | "choice";
    choices?: string[];
    expectedGain: number;
  };
  cachedQuestionGeneratedAt?: string;
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
