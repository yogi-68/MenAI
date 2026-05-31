import { getOpenAI } from "@/lib/ai/openai";
import { FAST_MODEL } from "@/lib/ai/models";
import { logAiUsage } from "@/lib/ai/usage-guard";
import {
  formatEvidenceBundleForPrompt,
  type EvidenceBundle,
} from "@/lib/user-model/evidence-bundle";
import {
  IDENTITY_DIMENSION_IDS,
  type IdentityCoverageMap,
  type IdentityDimensionId,
  type IdentityProfileStore,
  averageCoverage,
} from "@/lib/user-model/identity-dimensions";
import { computeBaselineCoverage } from "@/lib/user-model/identity-synthesis";

export const MARGINAL_GAIN_STOP = 3;
export const MAX_INTERVIEW_QUESTIONS_PER_DAY = 5;
export const COVERAGE_STOP_THRESHOLD = 78;

export interface AiInterviewQuestion {
  id: string;
  dimension: IdentityDimensionId;
  prompt: string;
  subtitle?: string;
  inputType: "text" | "number" | "date" | "choice";
  choices?: string[];
  expectedGain: number;
}

export interface AiIdentityInterviewResult {
  coverage: IdentityCoverageMap;
  overallCoverage: number;
  shouldContinue: boolean;
  expectedGain: number;
  weakestDimension: IdentityDimensionId | null;
  weakestLabel: string | null;
  question: AiInterviewQuestion | null;
  stopReason?: "low_marginal_gain" | "coverage_sufficient" | "max_questions" | "no_initiatives";
}

const INTERVIEW_SYSTEM = `You are MenAI's identity interview engine. You NEVER invent personality traits.

FORBIDDEN claims (unless explicit user evidence): disciplined, thrives on intensity, determined, resilient, naturally X.

Your job:
1. Score identity dimension coverage 0-100 using ONLY evidence and stored answers — not speculation
2. Pick the weakest dimension that would materially improve daily planning
3. Generate ONE high-value question for that dimension
4. Stop when expectedGain < 3 or overall coverage >= 78

Dimensions: direction, goals, execution_style, constraints, motivations, environment, decision_style, risk_profile, learning_style, planning_baseline

Use choice inputType when a fixed set of options helps (motivation, work style, constraints, decision style, risk).
Use number/date/text for measurable planning baselines (body-fat %, hours/week, deadlines).

Return JSON only:
{
  "coverage": { "direction": 0-100, ...all 10 keys },
  "expectedGain": 0-25,
  "shouldContinue": boolean,
  "weakestDimension": "dimension_id",
  "weakestLabel": "human label for UI",
  "stopReason": null | "low_marginal_gain" | "coverage_sufficient",
  "question": null | {
    "id": "unique_snake_case_id",
    "dimension": "dimension_id",
    "prompt": "question text",
    "subtitle": "why this helps planning",
    "inputType": "text|number|date|choice",
    "choices": ["optional","for","choice"],
    "expectedGain": 0-25
  }
}`;

function mergeCoverage(
  baseline: IdentityCoverageMap,
  ai: Partial<IdentityCoverageMap>
): IdentityCoverageMap {
  const out = { ...baseline };
  for (const id of IDENTITY_DIMENSION_IDS) {
    const aiVal = ai[id];
    if (typeof aiVal === "number" && !Number.isNaN(aiVal)) {
      out[id] = Math.round(Math.max(out[id], Math.min(100, aiVal)));
    }
  }
  return out;
}

export function fallbackInterviewStep(
  bundle: EvidenceBundle,
  identityProfile: IdentityProfileStore,
  askedToday: string[]
): AiIdentityInterviewResult {
  const coverage = identityProfile.lastCoverage ?? computeBaselineCoverage(bundle);
  const overall = averageCoverage(coverage);

  if (bundle.initiatives.length === 0) {
    return {
      coverage,
      overallCoverage: overall,
      shouldContinue: false,
      expectedGain: 0,
      weakestDimension: null,
      weakestLabel: null,
      question: null,
      stopReason: "no_initiatives",
    };
  }

  if (askedToday.length >= MAX_INTERVIEW_QUESTIONS_PER_DAY) {
    return {
      coverage,
      overallCoverage: overall,
      shouldContinue: false,
      expectedGain: 0,
      weakestDimension: null,
      weakestLabel: null,
      question: null,
      stopReason: "max_questions",
    };
  }

  const sorted = [...IDENTITY_DIMENSION_IDS].sort((a, b) => coverage[a] - coverage[b]);
  const weakest = sorted[0];
  const expectedGain = Math.max(3, Math.round((100 - coverage[weakest]) / 4));

  if (overall >= COVERAGE_STOP_THRESHOLD || expectedGain < MARGINAL_GAIN_STOP) {
    return {
      coverage,
      overallCoverage: overall,
      shouldContinue: false,
      expectedGain,
      weakestDimension: weakest,
      weakestLabel: weakest.replace(/_/g, " "),
      question: null,
      stopReason: expectedGain < MARGINAL_GAIN_STOP ? "low_marginal_gain" : "coverage_sufficient",
    };
  }

  return {
    coverage,
    overallCoverage: overall,
    shouldContinue: true,
    expectedGain,
    weakestDimension: weakest,
    weakestLabel: weakest.replace(/_/g, " "),
    question: {
      id: `${weakest}_open`,
      dimension: weakest,
      prompt: `What should MenAI know about your ${weakest.replace(/_/g, " ")}?`,
      subtitle: "This fills a gap in your identity model for better daily plans.",
      inputType: "text",
      expectedGain,
    },
    stopReason: undefined,
  };
}

export async function runAiIdentityInterviewStep(input: {
  bundle: EvidenceBundle;
  identityProfile: IdentityProfileStore;
  askedToday: string[];
  userId?: string;
}): Promise<AiIdentityInterviewResult> {
  const baseline = computeBaselineCoverage(input.bundle);

  if (input.bundle.initiatives.length === 0) {
    return fallbackInterviewStep(input.bundle, input.identityProfile, input.askedToday);
  }

  if (input.askedToday.length >= MAX_INTERVIEW_QUESTIONS_PER_DAY) {
    return fallbackInterviewStep(input.bundle, input.identityProfile, input.askedToday);
  }

  if (!input.userId) {
    return fallbackInterviewStep(input.bundle, input.identityProfile, input.askedToday);
  }

  try {
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: FAST_MODEL,
      temperature: 0.25,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: INTERVIEW_SYSTEM },
        {
          role: "user",
          content: `Evidence bundle:
${formatEvidenceBundleForPrompt(input.bundle)}

Questions already asked today: ${input.askedToday.join(", ") || "none"}
Baseline coverage (evidence-only): ${JSON.stringify(baseline)}

Generate the next interview step. If expectedGain would be below ${MARGINAL_GAIN_STOP}, set shouldContinue false and question null.`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("empty");

    const parsed = JSON.parse(raw) as {
      coverage?: Partial<IdentityCoverageMap>;
      expectedGain?: number;
      shouldContinue?: boolean;
      weakestDimension?: IdentityDimensionId;
      weakestLabel?: string;
      stopReason?: string;
      question?: AiInterviewQuestion | null;
    };

    const coverage = mergeCoverage(baseline, parsed.coverage || {});
    const overallCoverage = averageCoverage(coverage);
    const expectedGain = parsed.expectedGain ?? 0;

    let shouldContinue = Boolean(parsed.shouldContinue && parsed.question);
    let stopReason = parsed.stopReason as AiIdentityInterviewResult["stopReason"];

    if (input.askedToday.includes(parsed.question?.id || "")) {
      shouldContinue = false;
      stopReason = "low_marginal_gain";
    }

    if (expectedGain < MARGINAL_GAIN_STOP) {
      shouldContinue = false;
      stopReason = "low_marginal_gain";
    }

    if (overallCoverage >= COVERAGE_STOP_THRESHOLD && expectedGain <= 8) {
      shouldContinue = false;
      stopReason = "coverage_sufficient";
    }

    logAiUsage(
      input.userId,
      "plan_interview",
      FAST_MODEL,
      completion.usage?.prompt_tokens ?? 0,
      completion.usage?.completion_tokens ?? 0
    ).catch(() => {});

    return {
      coverage,
      overallCoverage,
      shouldContinue,
      expectedGain,
      weakestDimension: parsed.weakestDimension ?? null,
      weakestLabel: parsed.weakestLabel ?? null,
      question: shouldContinue ? parsed.question ?? null : null,
      stopReason: shouldContinue ? undefined : stopReason,
    };
  } catch {
    return fallbackInterviewStep(input.bundle, input.identityProfile, input.askedToday);
  }
}

export function buildInterviewQuestionPayload(
  question: AiInterviewQuestion,
  questionNumber: number
) {
  return {
    variableId: question.id,
    dimension: question.dimension,
    prompt: question.prompt,
    subtitle: question.subtitle,
    inputType: question.inputType,
    choices: question.choices,
    expectedGain: question.expectedGain,
    biggestUnknown: question.subtitle || question.prompt,
    questionNumber,
  };
}
