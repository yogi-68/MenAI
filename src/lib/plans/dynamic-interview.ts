import { getOpenAI } from "@/lib/ai/openai";
import { FAST_MODEL } from "@/lib/ai/models";
import { logAiUsage } from "@/lib/ai/usage-guard";
import type { GoalAnalysis, MissingVariable } from "@/lib/plans/coach-insights";
import {
  assignExpectedGains,
  INTERVIEW_STOP_OVERALL,
  MARGINAL_GAIN_STOP,
  MAX_INTERVIEW_QUESTIONS_PER_DAY,
  pickHighestGainGap,
} from "@/lib/plans/marginal-gain";
import type { UserModel } from "@/lib/user-model/types";

export {
  MARGINAL_GAIN_STOP,
  MAX_INTERVIEW_QUESTIONS_PER_DAY,
  INTERVIEW_STOP_OVERALL,
  assignExpectedGains,
} from "@/lib/plans/marginal-gain";

export interface InterviewContinuation {
  shouldInterview: boolean;
  stopReason?: "threshold_met" | "low_marginal_gain" | "no_gaps" | "max_questions";
  nextGap: MissingVariable | null;
}

export function evaluateInterviewContinuation(input: {
  missing: MissingVariable[];
  askedToday: string[];
  overallScore: number;
  hasInitiatives: boolean;
}): InterviewContinuation {
  if (!input.hasInitiatives) {
    return { shouldInterview: false, stopReason: "no_gaps", nextGap: null };
  }

  if (input.askedToday.length >= MAX_INTERVIEW_QUESTIONS_PER_DAY) {
    return { shouldInterview: false, stopReason: "max_questions", nextGap: null };
  }

  const withGains = assignExpectedGains(input.missing);
  const nextGap = pickHighestGainGap(withGains, input.askedToday);

  if (!nextGap) {
    return { shouldInterview: false, stopReason: "no_gaps", nextGap: null };
  }

  if (nextGap.expectedGain < MARGINAL_GAIN_STOP) {
    return { shouldInterview: false, stopReason: "low_marginal_gain", nextGap: null };
  }

  const remaining = withGains.filter((m) => !input.askedToday.includes(m.id));
  if (
    input.overallScore >= INTERVIEW_STOP_OVERALL &&
    remaining.length <= 1 &&
    nextGap.expectedGain <= 8
  ) {
    return { shouldInterview: false, stopReason: "threshold_met", nextGap: null };
  }

  return { shouldInterview: true, nextGap };
}

export interface DynamicQuestionPayload {
  variableId: string;
  prompt: string;
  subtitle?: string;
  inputType: "text" | "number" | "date";
  expectedGain: number;
  biggestUnknown: string;
  questionNumber: number;
}

const QUESTION_SYSTEM = `You generate ONE planning interview question for a personal execution coach.

Rules:
- Ask only about the specified missing variable for the user's domain.
- Never ask fitness questions for business goals or vice versa.
- Sound like a coach, not a form. One clear question, conversational.
- Include a brief subtitle explaining why this unlocks better daily plans.
- Return JSON only: {"prompt":"...","subtitle":"..."}`;

export async function generateDynamicInterviewQuestion(input: {
  gap: MissingVariable;
  goalAnalysis: GoalAnalysis;
  userModel: UserModel | null;
  initiativeTitle: string;
  domain: string;
  questionNumber: number;
  userId?: string;
}): Promise<{ prompt: string; subtitle?: string }> {
  const fallback = {
    prompt: input.gap.question,
    subtitle: input.gap.why,
  };

  if (!input.userId) return fallback;

  try {
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: FAST_MODEL,
      temperature: 0.35,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: QUESTION_SYSTEM },
        {
          role: "user",
          content: `Domain: ${input.domain}
Initiative: ${input.initiativeTitle}
Missing variable: ${input.gap.label} (id: ${input.gap.id})
Why it matters: ${input.gap.why}
Expected information gain: ${input.gap.expectedGain}/25
Known facts: ${input.goalAnalysis.knownFacts.join("; ") || "none"}
User identity themes: ${input.userModel?.identity.labels.join(", ") || "unknown"}
Current focus: ${input.userModel?.currentFocus.title || "unset"}
Default question: ${input.gap.question}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content;
    if (raw) {
      const parsed = JSON.parse(raw) as { prompt?: string; subtitle?: string };
      if (parsed.prompt?.trim()) {
        logAiUsage(
          input.userId,
          "plan_interview",
          FAST_MODEL,
          completion.usage?.prompt_tokens ?? 0,
          completion.usage?.completion_tokens ?? 0
        ).catch(() => {});
        return {
          prompt: parsed.prompt.trim(),
          subtitle: parsed.subtitle?.trim() || input.gap.why,
        };
      }
    }
  } catch {
    /* fallback */
  }

  return fallback;
}

export function buildDynamicQuestionPayload(
  gap: MissingVariable,
  question: { prompt: string; subtitle?: string },
  questionNumber: number
): DynamicQuestionPayload {
  return {
    variableId: gap.id,
    prompt: question.prompt,
    subtitle: question.subtitle,
    inputType: gap.inputType,
    expectedGain: gap.expectedGain,
    biggestUnknown: gap.label,
    questionNumber,
  };
}
