import type { CoachDomain } from "@/lib/plans/coach-insights";

export const USER_MODEL_VERSION = 1 as const;

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

  obstacles: string[];
  stillNeeds: string[];
  understands: string[];

  recentActivity: string | null;
  currentMilestone: string | null;
  opportunities: string[];

  confidence: UserModelConfidence;
  narrative: string;
  whoAmIAnswer: string;
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
  goal_id: string | null;
}

export interface GoalRow {
  id: string;
  title: string;
  description: string | null;
  target_date: string | null;
  category: string | null;
}
