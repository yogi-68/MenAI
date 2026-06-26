import type { CoachDomain } from "@/lib/plans/coach-insights";
import type {
  ActivePortfolioEntry,
  AllocationRole,
  ExecutionAllocationEntry,
} from "@/lib/user-model/execution-allocation";
import type {
  IdentityCoverageMap,
  WhoAmIStatement,
} from "@/lib/user-model/identity-dimensions";

export type { IdentityCoverageMap, WhoAmIStatement };

export const USER_MODEL_VERSION = 4 as const;

export type { ActivePortfolioEntry, AllocationRole, ExecutionAllocationEntry };

export type UserModelConfidence = "low" | "moderate" | "high";

export interface UserModelSecondaryOutcome {
  id: string;
  title: string;
  lifeArea: string | null;
  role: "initiative" | "direction";
  targetDate: string | null;
}

export interface UserModel {
  version: typeof USER_MODEL_VERSION;
  synthesizedAt: string;

  identity: {
    labels: string[];
    vision: string | null;
    longTermDirections: string[];
  };

  currentFocus: {
    initiativeId: string | null;
    title: string | null;
    lifeArea: string | null;
    domain: CoachDomain;
    until: string | null;
  };

  primaryOutcome: {
    headline: string | null;
    ninetyDayOutcome: string | null;
    targetDate: string | null;
  };

  secondaryOutcomes: UserModelSecondaryOutcome[];

  /** All active initiatives — one person, multiple pursuits */
  activePortfolio: ActivePortfolioEntry[];

  /** How today's execution time should split across initiatives */
  executionAllocation: ExecutionAllocationEntry[];

  obstacles: string[];
  stillNeeds: string[];
  understands: string[];

  recentActivity: string | null;
  currentMilestone: string | null;
  opportunities: string[];

  confidence: UserModelConfidence;
  narrative: string;
  whoAmIAnswer: string;
  whoAmIStatements: WhoAmIStatement[];
  evidence: string[];
  identityCoverage: IdentityCoverageMap;
  overallIdentityCoverage: number;

  /** Planning baseline from focus initiative interview — for coaching challenges */
  planningSnapshot?: {
    trainingDaysPerWeek?: number | null;
    weeklyAvailableHours?: number | null;
    studyHoursPerDay?: number | null;
    currentBodyFatPct?: number | null;
  };
  executionStats?: {
    completedTasks7d: number;
    reflections7d: number;
  };

  /** Ranked memory graph summary for chat retrieval */
  memoryGraphSummary?: string;
  secondaryFocusAreas?: string[];
  /** Pre-computed short bullets for coach rail (max 4, ~8 words each) */
  knowledgeBullets?: string[];
}

export interface InitiativeRow {
  id: string;
  title: string;
  description: string | null;
  target_date: string | null;
  life_area: string | null;
  last_action_at: string | null;
  status: string;
  progress: number | null;
  parent_goal_id: string | null;
}

export interface GoalRow {
  id: string;
  title: string;
  description: string | null;
  target_date: string | null;
  category: string | null;
}
