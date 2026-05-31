import type { EvidenceBundle } from "@/lib/user-model/evidence-bundle";
import {
  IDENTITY_DIMENSION_IDS,
  type IdentityCoverageMap,
  type WhoAmIStatement,
  type WhoAmIStatementTag,
} from "@/lib/user-model/identity-dimensions";
import { isConcreteInitiativeTitle } from "@/lib/initiatives/concreteness-gate";
import { buildMemoryGraphIdentityAnswer } from "@/lib/user-model/memory-graph-identity";
import { sanitizeCoachCopy } from "@/lib/user-model/content-guard";
import { rewriteRoboticPhrase } from "@/lib/user-model/voice-guide";

export interface WhoAmIResult {
  answer: string;
  statements: WhoAmIStatement[];
  evidence: string[];
}

function stmt(tag: WhoAmIStatementTag, text: string, evidence: string[]): WhoAmIStatement {
  return { tag, text, evidence };
}

function goalsMatching(bundle: EvidenceBundle, pattern: RegExp): string[] {
  return bundle.goals.filter((g) => pattern.test(g.title)).map((g) => g.title);
}

/** Rule-based baseline coverage from evidence only — no personality inference. */
export function computeBaselineCoverage(bundle: EvidenceBundle): IdentityCoverageMap {
  const answers = Object.values(bundle.identityAnswers);
  const hasAnswer = (dim: string) => answers.some((a) => a.dimension === dim);

  const direction = bundle.vision
    ? 90
    : bundle.identitySignals.length >= 1
      ? 70
      : bundle.goals.length >= 1
        ? 55
        : 15;

  const goals = Math.min(100, bundle.goals.length * 30 + (bundle.initiatives.length > 0 ? 20 : 0));

  let execution_style = 10;
  if (bundle.workStyle) execution_style = 75;
  else if (hasAnswer("execution_style")) execution_style = 80;
  else if (bundle.completedTasks7d >= 5) execution_style = 45;
  else if (bundle.completedTasks7d >= 1) execution_style = 25;

  let constraints = 15;
  if (bundle.planContextFields.biggestObstacle) constraints = 75;
  else if (hasAnswer("constraints")) constraints = 80;
  else if (bundle.reflectionBlocks.length > 0) constraints = 40;

  const motivations = hasAnswer("motivations") ? 85 : bundle.identitySignals.length >= 2 ? 35 : 10;

  const environment = hasAnswer("environment") ? 80 : 15;

  const decision_style = hasAnswer("decision_style") ? 85 : 10;

  const risk_profile = hasAnswer("risk_profile") ? 85 : 10;

  const learning_style = hasAnswer("learning_style") ? 85 : 10;

  let planning_baseline = 15;
  const pc = bundle.planContextFields;
  const planningFields = [
    "currentBodyFatPct",
    "currentWeight",
    "trainingDaysPerWeek",
    "weeklyAvailableHours",
    "currentMetric",
    "studyHoursPerDay",
    "initiativeOutcome90d",
  ];
  const filled = planningFields.filter((k) => pc[k] != null && pc[k] !== "").length;
  planning_baseline = Math.min(100, filled * 20 + (hasAnswer("planning_baseline") ? 30 : 0));

  return {
    direction,
    goals,
    execution_style,
    constraints,
    motivations,
    environment,
    decision_style,
    risk_profile,
    learning_style,
    planning_baseline,
  };
}

export function buildEvidenceBasedWhoAmI(
  bundle: EvidenceBundle,
  coverage: IdentityCoverageMap
): WhoAmIResult {
  const statements: WhoAmIStatement[] = [];
  const evidenceLog: string[] = [];

  if (bundle.goals.length > 0) {
    const e = bundle.goals.map((g) => `Goal: "${g.title}"`);
    evidenceLog.push(...e);
    statements.push(
      stmt(
        "verified",
        `You're working toward ${bundle.goals.length} long-term direction${bundle.goals.length > 1 ? "s" : ""}.`,
        e
      )
    );
  }

  if (bundle.initiatives.length > 0) {
    const e = bundle.initiatives.map((i) => `Initiative: "${i.title}"`);
    evidenceLog.push(...e);
    statements.push(
      stmt(
        "verified",
        `You have ${bundle.initiatives.length} active initiative${bundle.initiatives.length > 1 ? "s" : ""} in motion.`,
        e
      )
    );
  }

  if (bundle.focusTitle && isConcreteInitiativeTitle(bundle.focusTitle)) {
    const e = [`Focus initiative: "${bundle.focusTitle}"`];
    evidenceLog.push(...e);
    statements.push(
      stmt("verified", `Right now you're executing on ${bundle.focusTitle}.`, e)
    );
  } else if (bundle.focusTitle && !isConcreteInitiativeTitle(bundle.focusTitle)) {
    const e = [`Vague focus label stored: "${bundle.focusTitle}" — not used for identity`];
    evidenceLog.push(...e);
  }

  if (bundle.completedTasks7d > 0) {
    const e = [`${bundle.completedTasks7d} task(s) completed in last 7 days`];
    evidenceLog.push(...e);
    statements.push(
      stmt(
        "verified",
        `You completed ${bundle.completedTasks7d} task${bundle.completedTasks7d > 1 ? "s" : ""} in the last 7 days.`,
        e
      )
    );
  }

  if (bundle.reflections7d > 0) {
    const e = [`${bundle.reflections7d} reflection(s) in last 7 days`];
    evidenceLog.push(...e);
    statements.push(
      stmt(
        "verified",
        `You logged ${bundle.reflections7d} reflection${bundle.reflections7d > 1 ? "s" : ""} this week.`,
        e
      )
    );
  }

  if (bundle.patterns.length > 0) {
    const e = bundle.patterns.map((p) => `Observed pattern: ${p.pattern}`);
    evidenceLog.push(...e);
    statements.push(
      stmt(
        "verified",
        `The strongest pattern so far: ${bundle.patterns.map((p) => p.pattern).join("; ")}.`,
        e
      )
    );
  }

  if (bundle.planContextFields.biggestObstacle) {
    const blocker = String(bundle.planContextFields.biggestObstacle);
    const e = [`User-stated blocker: ${blocker}`];
    evidenceLog.push(...e);
    statements.push(
      stmt("verified", `You identified a current blocker: ${blocker}.`, e)
    );
  }

  const businessGoals = goalsMatching(bundle, /business|startup|saas|entrepreneur|product|scalable/i);
  const wealthGoals = goalsMatching(bundle, /wealth|financial|freedom|invest|income|asset/i);
  const realEstateGoals = goalsMatching(bundle, /real estate|property|realtor/i);
  const fitnessGoals = goalsMatching(bundle, /fitness|health|body|fat|train|weight/i);

  if (businessGoals.length > 0) {
    const e = businessGoals.map((t) => `Goal: "${t}"`);
    evidenceLog.push(...e);
    statements.push(
      stmt(
        "strong_inference",
        "Your goals point strongly toward entrepreneurship and product building.",
        e
      )
    );
  }
  if (wealthGoals.length > 0) {
    const e = wealthGoals.map((t) => `Goal: "${t}"`);
    evidenceLog.push(...e);
    if (!businessGoals.length) {
      statements.push(
        stmt(
          "strong_inference",
          "Your goals point toward long-term wealth creation.",
          e
        )
      );
    }
  }
  if (realEstateGoals.length > 0) {
    const e = realEstateGoals.map((t) => `Goal: "${t}"`);
    evidenceLog.push(...e);
    statements.push(
      stmt(
        "strong_inference",
        "Real estate shows up as a long-term interest in your goals.",
        e
      )
    );
  }
  if (fitnessGoals.length > 0) {
    const e = fitnessGoals.map((t) => `Goal: "${t}"`);
    evidenceLog.push(...e);
    statements.push(
      stmt(
        "strong_inference",
        "Physical health and fitness are part of your long-term picture.",
        e
      )
    );
  }

  if (bundle.founderMode) {
    const e = ["Founder mode enabled in profile"];
    evidenceLog.push(...e);
    statements.push(
      stmt("verified", "You have founder/builder mode enabled.", e)
    );
  }

  if (bundle.workStyle) {
    const e = [`Work style stored: ${bundle.workStyle}`];
    evidenceLog.push(...e);
    statements.push(stmt("verified", `Your recorded work style: ${bundle.workStyle}.`, e));
  }

  for (const dim of IDENTITY_DIMENSION_IDS) {
    if ((coverage[dim] ?? 0) < 25) {
      evidenceLog.push(`${dim} coverage: ${coverage[dim]}%`);
    }
  }

  if (bundle.completedTasks7d < 3 && bundle.reflections7d < 2) {
    const e = [
      `Only ${bundle.completedTasks7d} completed task(s) and ${bundle.reflections7d} reflection(s) in 7 days`,
    ];
    evidenceLog.push(...e);
    statements.push(
      stmt(
        "unknown",
        "There isn't enough execution history yet to identify your working style.",
        e
      )
    );
  }

  const memoryGraph = buildMemoryGraphIdentityAnswer(bundle);

  for (const es of memoryGraph.evidenceStatements) {
    evidenceLog.push(...es.evidence);
    statements.push(stmt("verified", es.text, es.evidence));
  }

  if (memoryGraph.paragraphs.length === 0) {
    const e = [`Only ${bundle.goals.length} goal(s), ${bundle.initiatives.length} initiative(s) on file`];
    evidenceLog.push(...e);
    statements.push(
      stmt(
        "unknown",
        "Not enough execution history yet — complete a few tasks and tell me what you're building.",
        e
      )
    );
  }

  const verifiedOnly = statements.filter((s) => s.tag === "verified" && s.evidence.length > 0);
  const rawAnswer =
    memoryGraph.evidenceStatements.length > 0
      ? [
          memoryGraph.opening,
          ...memoryGraph.evidenceStatements.map((s) => s.text),
          `What I'm still learning is ${memoryGraph.stillLearning}`,
        ].join("\n\n")
      : verifiedOnly.length > 0
        ? [
            memoryGraph.opening,
            ...verifiedOnly.slice(0, 4).map((s) => s.text),
            `What I'm still learning is ${memoryGraph.stillLearning}`,
          ].join("\n\n")
        : "Not enough evidence yet — share what you're building and complete a few tasks. Identity comes from what you do and say over time.";

  const answer = sanitizeCoachCopy(rewriteRoboticPhrase(rawAnswer));

  return { answer, statements, evidence: [...new Set(evidenceLog)] };
}

/** @deprecated Use buildEvidenceBasedWhoAmI */
export function buildWhoAmIAnswerFromContext(): string {
  return "Still building your profile from what you've logged so far.";
}

export async function synthesizeWhoAmIAnswer(
  bundle: EvidenceBundle,
  coverage: IdentityCoverageMap
): Promise<string> {
  return buildEvidenceBasedWhoAmI(bundle, coverage).answer;
}
