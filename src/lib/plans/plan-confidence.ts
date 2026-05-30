export interface PlanConfidence {
  score: number;
  gaps: string[];
  strengths: string[];
}

export interface ConfidenceInputs {
  initiatives: Array<{ title: string; targetDate?: string | null }>;
  commitments: string[];
  goals: string[];
  unfinishedTasks: string[];
  recentProgress: string[];
  obstacles: string[];
  upcomingDeadlines: string[];
  opportunities?: number;
}

const VAGUE_GOAL_PATTERNS = [
  /become (rich|wealthy|successful)/i,
  /work hard/i,
  /get fit$/i,
  /improve /i,
  /financial freedom$/i,
  /career growth$/i,
  /be healthier/i,
  /^make money/i,
];

export function isVagueContextText(text: string): boolean {
  return VAGUE_GOAL_PATTERNS.some((p) => p.test(text.trim()));
}

export function computePlanConfidence(input: ConfidenceInputs): PlanConfidence {
  let score = 0;
  const gaps: string[] = [];
  const strengths: string[] = [];

  const initiativeCount = input.initiatives.length;
  if (initiativeCount >= 2) {
    score += 30;
    strengths.push(`${initiativeCount} active initiatives with clear targets`);
  } else if (initiativeCount === 1) {
    score += 18;
    strengths.push("1 active initiative defined");
  } else {
    gaps.push("Missing active initiatives — add specific projects with deadlines");
  }

  if (input.upcomingDeadlines.length > 0) {
    score += 15;
    strengths.push(
      `${input.upcomingDeadlines.length} upcoming deadline${input.upcomingDeadlines.length > 1 ? "s" : ""}`
    );
  } else {
    gaps.push("No upcoming deadlines");
  }

  if (input.recentProgress.length >= 5) {
    score += 20;
    strengths.push(`${input.recentProgress.length} completed tasks in last 7 days`);
  } else if (input.recentProgress.length >= 1) {
    score += 10;
    strengths.push("Some recent activity logged");
  } else {
    gaps.push("Limited recent activity");
  }

  if (input.commitments.length >= 3) {
    score += 12;
    strengths.push(`${input.commitments.length} active commitments`);
  } else if (input.commitments.length >= 1) {
    score += 6;
  } else {
    gaps.push("Few specific commitments");
  }

  if (input.obstacles.length > 0) {
    score += 10;
    strengths.push("Clear execution patterns detected");
  }

  if ((input.opportunities ?? 0) > 0) {
    score += 8;
    strengths.push(`${input.opportunities} active opportunit${input.opportunities === 1 ? "y" : "ies"} logged`);
  }

  if (input.unfinishedTasks.length > 0) {
    score += 8;
  }

  const vagueGoals = input.goals.filter(isVagueContextText);
  const vagueCommitments = input.commitments.filter(isVagueContextText);
  if ((vagueGoals.length > 0 || vagueCommitments.length > 0) && initiativeCount === 0) {
    gaps.push("Goals/commitments are too broad — add specific initiatives");
    score = Math.max(0, score - 20);
  }

  if (initiativeCount === 0 && input.goals.length <= 1 && input.recentProgress.length === 0) {
    gaps.push("Very little structured context on file");
    score = Math.min(score, 35);
  }

  return {
    score: Math.min(100, Math.max(0, score)),
    gaps,
    strengths,
  };
}

export function confidenceLabel(score: number): "low" | "medium" | "high" {
  if (score >= 75) return "high";
  if (score >= 45) return "medium";
  return "low";
}

export type ConfidenceTier = "low" | "medium" | "high";

export function confidenceTier(score: number): ConfidenceTier {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}
