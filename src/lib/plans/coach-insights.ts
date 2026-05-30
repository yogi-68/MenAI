/**
 * Coach intelligence — transforms stored data into insights a smart coach would say.
 * Every user-facing sentence should prove understanding, inference, or discovery.
 */

export type CoachDomain = "fitness" | "business" | "learning" | "career" | "general";

export interface KnownFacts {
  domain: CoachDomain;
  initiativeTitle?: string;
  initiativeDescription?: string;
  targetDate?: string | null;
  lifeArea?: string | null;
  goalTexts: string[];
  planContext: Record<string, unknown>;
}

export interface MissingVariable {
  id: string;
  label: string;
  question: string;
  inputType: "text" | "number" | "date";
  why: string;
}

export interface GoalAnalysis {
  headline: string;
  daysRemaining: number | null;
  deadlineLabel: string | null;
  knownFacts: string[];
  missingVariables: MissingVariable[];
  onceKnown: string[];
  coachInsight: string;
}

export interface CoachBriefing {
  tryingToAchieve: string | null;
  understands: string[];
  stillNeeds: string[];
  insight: string;
  mattersToday: string | null;
  recentActivity: string | null;
}

const DOMAIN_PATTERNS: Record<CoachDomain, RegExp[]> = {
  fitness: [
    /\b(body fat|fat loss|weight|kg|lbs|workout|gym|calorie|nutrition|fitness|lean|bulk|cardio|protein)\b/i,
  ],
  business: [
    /\b(saas|startup|mvp|beta user|customer|revenue|mrr|launch|product|founder|outreach)\b/i,
  ],
  learning: [
    /\b(exam|upsc|study|syllabus|certification|course|prelims|mock test|revision)\b/i,
  ],
  career: [
    /\b(job|interview|resume|application|offer|salary|hire|portfolio|networking)\b/i,
  ],
  general: [],
};

const OBVIOUS_PATTERNS = [
  /^building a .+ is crucial/i,
  /^it is important to/i,
  /^.+\s+is crucial for your/i,
  /^completing the .+ is a crucial/i,
  /^you wanted /i,
  /^your goal is to /i,
  /^focus on building/i,
  /financial freedom/i,
  /consistent fitness routine is crucial/i,
];

export function detectDomain(text: string, lifeArea?: string | null): CoachDomain {
  const combined = `${text} ${lifeArea || ""}`.toLowerCase();
  if (lifeArea === "health" || lifeArea === "fitness") return "fitness";
  if (lifeArea === "business") return "business";
  if (lifeArea === "learning") return "learning";
  if (lifeArea === "career") return "career";

  for (const [domain, patterns] of Object.entries(DOMAIN_PATTERNS) as [CoachDomain, RegExp[]][]) {
    if (domain === "general") continue;
    if (patterns.some((p) => p.test(combined))) return domain;
  }
  return "general";
}

function daysUntil(dateStr: string): number | null {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function formatDeadline(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function extractTargetFromText(text: string): string | null {
  const bf = text.match(/(\d{1,2})\s*%\s*body\s*fat/i);
  if (bf) return `${bf[1]}% body fat`;
  const kg = text.match(/lose\s+(\d+(?:\.\d+)?)\s*kg/i);
  if (kg) return `lose ${kg[1]} kg`;
  const users = text.match(/(\d+)\s+beta\s+users?/i);
  if (users) return `${users[1]} beta users`;
  return null;
}

export function computeMissingVariables(facts: KnownFacts): MissingVariable[] {
  const ctx = facts.planContext;
  const text = [facts.initiativeTitle, facts.initiativeDescription, ...facts.goalTexts]
    .filter(Boolean)
    .join(" ");
  const domain = facts.domain;
  const missing: MissingVariable[] = [];

  const has = (key: string) => {
    const v = ctx[key];
    return v != null && String(v).trim() !== "";
  };

  if (domain === "fitness") {
    if (!has("currentWeight"))
      missing.push({
        id: "currentWeight",
        label: "Current weight",
        question: "What's your current weight? (kg or lbs)",
        inputType: "number",
        why: "Needed to estimate how much fat to lose and set a weekly target.",
      });
    if (!has("currentBodyFatPct") && /\d{1,2}\s*%\s*body\s*fat|body fat to \d/i.test(text))
      missing.push({
        id: "currentBodyFatPct",
        label: "Current body-fat %",
        question: "What's your estimated body-fat percentage right now?",
        inputType: "number",
        why: "This is the biggest missing variable — MenAI can't calculate a realistic deficit without it.",
      });
    if (!has("trainingDaysPerWeek"))
      missing.push({
        id: "trainingDaysPerWeek",
        label: "Training frequency",
        question: "How many days per week can you train?",
        inputType: "number",
        why: "Determines how to split cardio, strength, and recovery in your weekly plan.",
      });
  } else if (domain === "business") {
    if (!has("currentMetric") && /user|customer|revenue|mrr/i.test(text))
      missing.push({
        id: "currentMetric",
        label: "Current progress",
        question: "Where are you now? (e.g. 0 users, 3 paying customers, $200 MRR)",
        inputType: "text",
        why: "MenAI needs a baseline to set this week's acquisition or shipping target.",
      });
    if (!has("initiativeOutcome90d") && !extractTargetFromText(text))
      missing.push({
        id: "initiativeOutcome90d",
        label: "90-day outcome",
        question: "What's the single measurable outcome for the next 90 days?",
        inputType: "text",
        why: "Turns a vague build goal into a number MenAI can plan backward from.",
      });
    if (!has("biggestObstacle"))
      missing.push({
        id: "biggestObstacle",
        label: "Biggest blocker",
        question: "What's the main thing slowing progress — distribution, building, clarity, or time?",
        inputType: "text",
        why: "Today's tasks should work around your actual constraint.",
      });
    if (!has("weeklyAvailableHours"))
      missing.push({
        id: "weeklyAvailableHours",
        label: "Available hours",
        question: "How many hours per week can you spend on this?",
        inputType: "number",
        why: "Prevents over-ambitious daily plans.",
      });
  } else if (domain === "learning") {
    if (!facts.targetDate)
      missing.push({
        id: "targetDate",
        label: "Exam date",
        question: "When is your exam or deadline?",
        inputType: "date",
        why: "MenAI needs the timeline to pace revision vs new topics.",
      });
    if (!has("studyHoursPerDay"))
      missing.push({
        id: "studyHoursPerDay",
        label: "Study hours",
        question: "How many hours per day can you study on weekdays?",
        inputType: "number",
        why: "Determines how many topics fit in today's plan.",
      });
    if (!has("biggestObstacle"))
      missing.push({
        id: "biggestObstacle",
        label: "Biggest bottleneck",
        question: "What's hardest right now — retention, finishing syllabus, or consistency?",
        inputType: "text",
        why: "Different bottlenecks need different daily tasks.",
      });
  } else {
    if (!facts.targetDate)
      missing.push({
        id: "targetDate",
        label: "Deadline",
        question: facts.initiativeTitle
          ? `When do you want to achieve "${facts.initiativeTitle}" by?`
          : "When is your target date?",
        inputType: "date",
        why: "Without a deadline, MenAI can't prioritize what matters this week.",
      });
    if (!has("biggestObstacle"))
      missing.push({
        id: "biggestObstacle",
        label: "Biggest obstacle",
        question: "What's the main thing preventing progress right now?",
        inputType: "text",
        why: "Plans should address your constraint, not generic productivity.",
      });
    if (!has("weeklyAvailableHours"))
      missing.push({
        id: "weeklyAvailableHours",
        label: "Available time",
        question: "How many hours per week can you realistically spend on this?",
        inputType: "number",
        why: "Keeps daily tasks achievable.",
      });
  }

  return missing;
}

export function buildGoalAnalysis(facts: KnownFacts): GoalAnalysis {
  const missing = computeMissingVariables(facts);
  const knownFacts: string[] = [];
  const ctx = facts.planContext;

  if (facts.initiativeTitle) knownFacts.push(`Initiative: ${facts.initiativeTitle}`);
  const extracted = extractTargetFromText(
    [facts.initiativeTitle, facts.initiativeDescription, ...facts.goalTexts].join(" ")
  );
  if (extracted) knownFacts.push(`Target: ${extracted}`);
  if (facts.targetDate) knownFacts.push(`Deadline: ${formatDeadline(facts.targetDate)}`);
  if (ctx.currentWeight) knownFacts.push(`Current weight: ${ctx.currentWeight}`);
  if (ctx.currentBodyFatPct) knownFacts.push(`Current body-fat: ${ctx.currentBodyFatPct}%`);
  if (ctx.trainingDaysPerWeek) knownFacts.push(`Training: ${ctx.trainingDaysPerWeek} days/week`);
  if (ctx.weeklyAvailableHours) knownFacts.push(`${ctx.weeklyAvailableHours} hrs/week available`);
  if (ctx.biggestObstacle) knownFacts.push(`Blocker: ${ctx.biggestObstacle}`);

  const daysRemaining = facts.targetDate ? daysUntil(facts.targetDate) : null;
  const deadlineLabel = facts.targetDate ? formatDeadline(facts.targetDate) : null;

  const onceKnown: string[] =
    facts.domain === "fitness"
      ? ["Required fat loss rate", "Weekly calorie deficit target", "Training volume split"]
      : facts.domain === "business"
        ? ["Weekly acquisition target", "Ship vs sell balance", "Critical path tasks"]
        : facts.domain === "learning"
          ? ["Topics per week", "Revision vs new learning ratio", "Mock test schedule"]
          : ["Weekly milestone pace", "Daily priority stack", "Risk flags"];

  let coachInsight: string;
  if (daysRemaining != null && daysRemaining > 0 && missing.length > 0) {
    coachInsight = `You have ${daysRemaining} days until ${deadlineLabel}, but MenAI doesn't yet know your ${missing[0].label.toLowerCase()}. That's the biggest missing variable preventing a realistic plan.`;
  } else if (missing.length > 0) {
    coachInsight = `MenAI already knows your direction${extracted ? ` (${extracted})` : ""}, but still needs your ${missing[0].label.toLowerCase()} before it can plan with precision.`;
  } else if (daysRemaining != null && daysRemaining > 0) {
    coachInsight = `${daysRemaining} days until ${deadlineLabel} — MenAI has enough context to build specific daily tasks. Focus on execution this week.`;
  } else {
    coachInsight =
      "MenAI has the basics. Today's plan should target your current milestone, not restate your goal.";
  }

  return {
    headline: "Goal analysis",
    daysRemaining,
    deadlineLabel,
    knownFacts,
    missingVariables: missing,
    onceKnown,
    coachInsight,
  };
}

export interface BriefingInput {
  initiatives: Array<{
    title: string;
    description?: string | null;
    target_date?: string | null;
    life_area?: string | null;
    last_action_at?: string | null;
  }>;
  goals: Array<{ title: string }>;
  planContext: Record<string, unknown>;
  completedTasks7d: number;
  reflections7d: number;
  whatMattersNow?: string | null;
  currentMilestone?: string | null;
}

export function buildCoachBriefing(input: BriefingInput): CoachBriefing {
  const primary = input.initiatives[0];
  if (!primary) {
    return {
      tryingToAchieve: null,
      understands: [],
      stillNeeds: ["A specific initiative with a deadline"],
      insight: "Direction without an initiative is just intention. Pick one thing to execute this month.",
      mattersToday: null,
      recentActivity: null,
    };
  }

  const domain = detectDomain(`${primary.title} ${primary.description || ""}`, primary.life_area);
  const facts: KnownFacts = {
    domain,
    initiativeTitle: primary.title,
    initiativeDescription: primary.description ?? undefined,
    targetDate: primary.target_date,
    lifeArea: primary.life_area,
    goalTexts: input.goals.map((g) => g.title),
    planContext: input.planContext,
  };

  const analysis = buildGoalAnalysis(facts);

  let recentActivity: string | null;
  if (input.completedTasks7d >= 3) {
    recentActivity = `${input.completedTasks7d} tasks completed in the last 7 days — execution data is building.`;
  } else if (input.completedTasks7d >= 1) {
    recentActivity = `${input.completedTasks7d} task completed this week. One more reflection would sharpen tomorrow's plan.`;
  } else if (input.reflections7d >= 1) {
    recentActivity = "Reflections logged but no completed tasks yet — plans need execution to learn from.";
  } else {
    recentActivity = "No tasks or reflections logged recently. MenAI can't identify patterns yet.";
  }

  const mattersToday: string | null =
    input.currentMilestone
      ? `Advance: ${input.currentMilestone}`
      : input.whatMattersNow && !isObviousRestatement(primary.title, input.whatMattersNow)
        ? input.whatMattersNow
        : analysis.missingVariables.length > 0
          ? `Fill in ${analysis.missingVariables[0].label.toLowerCase()} — then regenerate today's plan`
          : null;

  return {
    tryingToAchieve: primary.title,
    understands: analysis.knownFacts.filter((f) => !f.startsWith("Initiative:")),
    stillNeeds: analysis.missingVariables.map((m) => m.label),
    insight: analysis.coachInsight,
    mattersToday,
    recentActivity,
  };
}

export function isObviousRestatement(userText: string, aiText: string): boolean {
  if (!aiText?.trim() || !userText?.trim()) return false;
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^\w\s%]/g, "").replace(/\s+/g, " ").trim();
  const u = normalize(userText);
  const a = normalize(aiText);
  if (a.includes(u) && u.length > 15) return true;
  if (OBVIOUS_PATTERNS.some((p) => p.test(aiText))) return true;
  const uWords = new Set(u.split(" ").filter((w) => w.length > 3));
  const aWords = a.split(" ").filter((w) => w.length > 3);
  if (aWords.length === 0) return false;
  const overlap = aWords.filter((w) => uWords.has(w)).length / aWords.length;
  return overlap > 0.75 && uWords.size >= 3;
}

export function sanitizeCoachText(
  text: string | undefined,
  context: { userGoal?: string; missingVariables?: string[] }
): string | undefined {
  if (!text?.trim()) return text;
  let t = text.trim();

  if (context.userGoal && isObviousRestatement(context.userGoal, t)) {
    if (context.missingVariables?.length) {
      const goal = context.userGoal.slice(0, 60) + (context.userGoal.length > 60 ? "…" : "");
      return `MenAI knows your target (${goal}), but still needs ${context.missingVariables.slice(0, 2).join(" and ").toLowerCase()} to plan specifically.`;
    }
    return undefined;
  }

  t = t.replace(/^Based on the information available,?\s*/i, "");
  t = t.replace(/^Based on (the )?available data,?\s*/i, "");
  if (OBVIOUS_PATTERNS.some((p) => p.test(t))) {
    return context.missingVariables?.length
      ? `Biggest gap: ${context.missingVariables[0].toLowerCase()}. Answer the questions above to unlock a specific plan.`
      : undefined;
  }
  return t;
}

export const COACH_WRITING_RULES = `
COACH VOICE (mandatory):
- NEVER restate the user's goal as insight ("building X is crucial", "your focus is X").
- NEVER use "Based on the information available" — say what's missing instead.
- NEVER celebrate milestones or plans that only exist in the database with no completed tasks or reflections.
- Every sentence must add: a number, a deadline, a missing variable, a constraint, or a specific next action.
- If context is thin: "MenAI doesn't know your current body-fat %" not "fitness is important".
- Prefer: "You have N days until [date], but [missing variable] blocks a realistic plan."
`.trim();

export function pickNextMissingQuestion(
  missing: MissingVariable[],
  alreadyAsked: string[]
): MissingVariable | null {
  return missing.find((m) => !alreadyAsked.includes(m.id)) ?? null;
}
