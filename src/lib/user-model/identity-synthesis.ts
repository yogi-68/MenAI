import { getOpenAI } from "@/lib/ai/openai";
import { FAST_MODEL } from "@/lib/ai/models";
import { logAiUsage } from "@/lib/ai/usage-guard";
import type { CoachDomain } from "@/lib/plans/coach-insights";
import type { UserModelConfidence } from "@/lib/user-model/types";

export interface IdentitySynthesisInput {
  vision: string | null;
  founderMode: boolean;
  workStyle: string | null;
  identityLabels: string[];
  identitySignals: Array<{ description: string; long_term_direction: string | null }>;
  goals: Array<{ title: string; category: string | null }>;
  initiativeThemes: Array<{ title: string; lifeArea: string | null; domain: CoachDomain }>;
  focusTitle: string | null;
  focusDomain: CoachDomain;
  patterns: Array<{ pattern: string; behavioral_impact: string | null; severity?: string | null }>;
  completedTasks7d: number;
  reflections7d: number;
  obstacles: string[];
  stillNeeds: string[];
  confidence: UserModelConfidence;
  portfolioCount: number;
  opportunities: string[];
  recentReflectionBlocks: string[];
}

function inferArchetype(input: IdentitySynthesisInput): string | null {
  const corpus = [
    input.vision || "",
    ...input.identitySignals.map((s) => `${s.description} ${s.long_term_direction || ""}`),
    ...input.goals.map((g) => g.title),
    ...input.identityLabels,
  ]
    .join(" ")
    .toLowerCase();

  const parts: string[] = [];

  if (
    input.founderMode ||
    /builder|entrepreneur|founder|saas|startup|product|systems|ownership|scale/i.test(corpus)
  ) {
    parts.push(
      "You're a builder — you tend to think in systems, products, and long-term ownership rather than short-term income."
    );
  } else if (/learn|study|exam|certification|skill/i.test(corpus)) {
    parts.push("You're a dedicated learner — you invest in capability and structured growth.");
  } else if (input.portfolioCount >= 2) {
    parts.push("You're someone who runs multiple pursuits in parallel — ambitious, but attention is a real constraint.");
  } else {
    parts.push("You're someone actively shaping your direction — not drifting, but still being defined by your execution.");
  }

  return parts[0] ?? null;
}

function inferDirectionThemes(input: IdentitySynthesisInput): string | null {
  const themes = new Set<string>();

  for (const g of input.goals.slice(0, 5)) {
    const t = g.title.trim();
    if (t.length > 4 && t.length < 100) themes.add(t);
  }

  for (const s of input.identitySignals) {
    if (s.long_term_direction && s.long_term_direction.length < 90) {
      themes.add(s.long_term_direction);
    }
  }

  if (input.vision && input.vision.length < 120) {
    themes.add(input.vision);
  }

  const keywordThemes: string[] = [];
  const corpus = [...themes].join(" ").toLowerCase();
  if (/entrepreneur|business|saas|startup|product|ai/i.test(corpus)) keywordThemes.push("entrepreneurship and product building");
  if (/wealth|financial|invest|freedom|income|asset/i.test(corpus)) keywordThemes.push("financial independence and scalable assets");
  if (/real estate|property|investing/i.test(corpus)) keywordThemes.push("investing and real estate");
  if (/fitness|health|body|fat|train/i.test(corpus)) keywordThemes.push("physical health and discipline");
  if (/learn|career|job|skill/i.test(corpus)) keywordThemes.push("skill-building and career growth");

  if (keywordThemes.length === 0 && themes.size === 0) return null;

  const list =
    keywordThemes.length > 0
      ? keywordThemes.slice(0, 4).join(", ")
      : [...themes].slice(0, 3).join("; ");

  return `You're interested in ${list}.`;
}

function inferLifeShape(input: IdentitySynthesisInput): string | null {
  if (input.portfolioCount <= 1 && !input.focusTitle) return null;

  const areas = input.initiativeThemes.map((i) => i.lifeArea || i.domain).filter(Boolean);
  const unique = [...new Set(areas)];

  if (input.portfolioCount >= 2) {
    const names = input.initiativeThemes
      .slice(0, 4)
      .map((i) => i.title)
      .join(", ");
    return `You currently have multiple active interests — including ${names} — which creates ambition but can sometimes split your attention.${input.focusTitle ? ` Right now, ${input.focusTitle} is getting the most execution emphasis.` : ""}`;
  }

  if (input.focusTitle && unique.length <= 1) {
    return `Your current execution emphasis is ${input.focusDomain.replace("_", " ")} work — one primary pursuit with room to add more over time.`;
  }

  return null;
}

function inferPatternsAndConstraints(input: IdentitySynthesisInput): string | null {
  const parts: string[] = [];

  if (input.patterns.length > 0) {
    const top = input.patterns.slice(0, 2);
    const described = top
      .map((p) => {
        const impact = p.behavioral_impact ? ` — ${p.behavioral_impact}` : "";
        return `${p.pattern}${impact}`;
      })
      .join("; ");
    parts.push(`MenAI sees recurring patterns: ${described}.`);
  }

  if (input.obstacles.length > 0) {
    parts.push(`Current constraints include: ${input.obstacles.slice(0, 2).join("; ")}.`);
  }

  if (input.recentReflectionBlocks.length > 0) {
    parts.push(`Recent reflections mention being blocked by: ${input.recentReflectionBlocks.slice(0, 2).join("; ")}.`);
  }

  if (input.workStyle) {
    parts.push(`Work style on file: ${input.workStyle}.`);
  }

  return parts.length > 0 ? parts.join(" ") : null;
}

function inferEvidenceGap(input: IdentitySynthesisInput): string | null {
  const hasRichIdentity =
    input.identitySignals.length >= 2 || input.goals.length >= 2 || Boolean(input.vision);

  if (input.completedTasks7d >= 5 && input.reflections7d >= 2) {
    return "MenAI has enough execution history to start identifying your working habits and follow-through patterns with confidence.";
  }

  if (input.completedTasks7d >= 2) {
    return "MenAI sees early execution signals but still needs more consistent task completion and reflections to confidently map your productivity patterns and decision-making tendencies.";
  }

  if (hasRichIdentity && input.completedTasks7d === 0) {
    return "MenAI currently sees strong evidence for your direction and interests, but it still lacks enough execution history to confidently identify your strongest working habits, productivity patterns, and decision-making tendencies.";
  }

  if (input.stillNeeds.length > 0) {
    return `What's still unclear for planning: ${input.stillNeeds.slice(0, 3).join(", ").toLowerCase()}.`;
  }

  return "MenAI is still building a picture of how you actually work — not just what you're aiming at.";
}

export function buildWhoAmIAnswerFromContext(input: IdentitySynthesisInput): string {
  const paragraphs = [
    inferArchetype(input),
    inferDirectionThemes(input),
    inferLifeShape(input),
    inferPatternsAndConstraints(input),
    inferEvidenceGap(input),
  ].filter(Boolean) as string[];

  if (paragraphs.length === 0) {
    return "MenAI is still learning who you are. Share more through chat, daily execution, and reflections — not just goals — and I'll reflect your identity back with specificity.";
  }

  return paragraphs.join("\n\n");
}

const WHO_AM_I_SYSTEM = `You answer "Who am I?" for a personal execution coach app.

Rules:
- Describe WHO the person is: identity, thinking style, direction, patterns, constraints, unknowns.
- NEVER open with "You're focused on [goal/initiative] by [date]" — that is NOT identity.
- Do NOT read like a database dump of initiatives or deadlines.
- Synthesize: builder/learner/operator archetype, long-term themes, multi-pursuit tension if applicable, behavioral patterns, what MenAI still can't infer.
- 2-4 short paragraphs, coach voice, second person ("You").
- No bullet lists. No hedging filler ("Based on available data").`;

function buildWhoAmIPrompt(input: IdentitySynthesisInput, ruleBased: string): string {
  return `Synthesize a "Who am I?" answer from this evidence:

Vision: ${input.vision || "unknown"}
Founder mode: ${input.founderMode}
Work style: ${input.workStyle || "unknown"}
Identity labels: ${input.identityLabels.join(", ") || "none"}
Identity signals: ${input.identitySignals.map((s) => s.long_term_direction || s.description).join("; ") || "none"}
Long-term goals: ${input.goals.map((g) => g.title).join("; ") || "none"}
Active pursuits (themes only, not deadlines): ${input.initiativeThemes.map((i) => `${i.title} (${i.domain})`).join("; ") || "none"}
Current emphasis (secondary): ${input.focusTitle || "none"}
Behavioral patterns: ${input.patterns.map((p) => p.pattern).join("; ") || "none"}
Obstacles: ${input.obstacles.join("; ") || "none"}
Tasks completed (7d): ${input.completedTasks7d}
Reflections (7d): ${input.reflections7d}
Still unknown for planning: ${input.stillNeeds.join(", ") || "none"}

Rule-based draft (improve on this, do not copy verbatim if it sounds like a goal summary):
${ruleBased}`;
}

export async function synthesizeWhoAmIAnswer(
  input: IdentitySynthesisInput,
  userId?: string
): Promise<string> {
  const ruleBased = buildWhoAmIAnswerFromContext(input);

  if (!userId) return ruleBased;

  try {
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: FAST_MODEL,
      temperature: 0.45,
      messages: [
        { role: "system", content: WHO_AM_I_SYSTEM },
        { role: "user", content: buildWhoAmIPrompt(input, ruleBased) },
      ],
    });

    const text = completion.choices[0]?.message?.content?.trim();
    if (text && text.length >= 80 && !/^you('re| are) focused on/i.test(text)) {
      logAiUsage(
        userId,
        "user_model",
        FAST_MODEL,
        completion.usage?.prompt_tokens ?? 0,
        completion.usage?.completion_tokens ?? 0
      ).catch(() => {});
      return text;
    }
  } catch {
    /* fall back to rule-based */
  }

  return ruleBased;
}
