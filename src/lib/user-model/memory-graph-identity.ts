import type { EvidenceBundle } from "@/lib/user-model/evidence-bundle";
import { isConcreteInitiativeTitle } from "@/lib/initiatives/concreteness-gate";

export interface ThemeActivity {
  key: string;
  theme: string;
  mentions: number;
  sources: string[];
  recent: boolean;
}

const THEME_RULES: Array<{ key: string; label: string; re: RegExp }> = [
  { key: "business", label: "business ownership", re: /business|startup|saas|agency|entrepreneur|client|product|mvp/i },
  { key: "wealth", label: "financial independence", re: /wealth|financial|freedom|income|invest|finance|money|recurring/i },
  { key: "fitness", label: "fitness", re: /fitness|health|gym|workout|body|fat|train|weight/i },
  { key: "learning", label: "learning and exams", re: /upsc|exam|study|learn|course|certification/i },
  { key: "career", label: "career growth", re: /career|job|promotion|hire|role/i },
  { key: "relationships", label: "relationships", re: /relationship|family|partner|wife|husband/i },
];

function addTheme(
  map: Map<string, ThemeActivity>,
  key: string,
  label: string,
  source: string,
  recent = true
) {
  const cur = map.get(key) || { key, theme: label, mentions: 0, sources: [], recent: false };
  cur.mentions += 1;
  if (!cur.sources.includes(source)) cur.sources.push(source);
  if (recent) cur.recent = true;
  map.set(key, cur);
}

export function computeThemeActivity(bundle: EvidenceBundle): ThemeActivity[] {
  const map = new Map<string, ThemeActivity>();
  const thirtyDaysAgo = Date.now() - 30 * 86400000;

  for (const g of bundle.goals) {
    for (const rule of THEME_RULES) {
      if (rule.re.test(g.title)) addTheme(map, rule.key, rule.label, `Goal: "${g.title}"`);
    }
  }

  for (const i of bundle.initiatives) {
    const corpus = `${i.title} ${i.lifeArea || ""}`;
    for (const rule of THEME_RULES) {
      if (rule.re.test(corpus)) addTheme(map, rule.key, rule.label, `Initiative: "${i.title}"`);
    }
  }

  for (const s of bundle.identitySignals) {
    const corpus = `${s.description} ${s.long_term_direction || ""}`;
    for (const rule of THEME_RULES) {
      if (rule.re.test(corpus)) addTheme(map, rule.key, rule.label, `Signal: ${s.description}`);
    }
  }

  for (const m of bundle.mentorMemories) {
    const isRecent = m.lastMentionedAt
      ? new Date(m.lastMentionedAt).getTime() >= thirtyDaysAgo
      : m.effectiveConfidence >= 0.5;
    for (const rule of THEME_RULES) {
      if (rule.re.test(m.text)) {
        addTheme(
          map,
          rule.key,
          rule.label,
          `You said: "${m.text.slice(0, 60)}${m.text.length > 60 ? "…" : ""}"`,
          isRecent
        );
      }
    }
  }

  return [...map.values()]
    .filter((t) => t.mentions >= 1)
    .sort((a, b) => b.mentions - a.mentions);
}

const GENERIC_BANNED =
  /\b(ambitious|seek growth|highly focused on creating more freedom|think in systems|think like a builder|good sign|great person)\b/i;

/** Evidence-only Who am I — every sentence cites stored data. No generic personality fluff. */
export function buildMemoryGraphIdentityAnswer(bundle: EvidenceBundle): {
  opening: string;
  paragraphs: string[];
  stillLearning: string;
  evidenceStatements: Array<{ text: string; evidence: string[] }>;
} {
  const paragraphs: string[] = [];
  const evidenceStatements: Array<{ text: string; evidence: string[] }> = [];
  const themes = computeThemeActivity(bundle);
  const recentThemes = themes.filter((t) => t.recent && t.mentions >= 1);
  const strongThemes = themes.filter((t) => t.mentions >= 2);

  if (strongThemes.length >= 1) {
    const focusList = strongThemes
      .slice(0, 3)
      .map((t) => t.theme)
      .join(", ");
    const evidence = strongThemes.slice(0, 3).flatMap((t) => t.sources.slice(0, 2));
    const text = `Over the last month you've repeatedly focused on ${focusList} — this shows up across ${evidence.length} stored signals (goals, initiatives, and what you've told me).`;
    paragraphs.push(text);
    evidenceStatements.push({ text, evidence });
  } else if (recentThemes.length === 1) {
    const t = recentThemes[0];
    const text = `Recently, ${t.theme} has been your main thread (${t.mentions} mention${t.mentions > 1 ? "s" : ""} on file).`;
    paragraphs.push(text);
    evidenceStatements.push({ text, evidence: t.sources });
  }

  const recentFitness = themes.find((t) => t.key === "fitness" && t.recent);
  const dominantBusiness = themes.find((t) => t.key === "business" && t.mentions >= 2);
  if (recentFitness && dominantBusiness && recentFitness.mentions >= 1) {
    const text = `Fitness has also become more important recently — it appeared in ${recentFitness.mentions} conversation${recentFitness.mentions > 1 ? "s" : ""} and planning context, alongside your business focus.`;
    paragraphs.push(text);
    evidenceStatements.push({ text, evidence: recentFitness.sources });
  }

  const topPattern = bundle.patterns[0];
  if (topPattern && (topPattern.occurrences ?? 0) >= 2) {
    const label = topPattern.pattern.replace(/_/g, " ");
    const mentions = topPattern.occurrences ?? 1;
    const conf = Math.round((topPattern.confidence ?? 0.7) * 100);
    const text = `Execution friction: ${label} has come up ${mentions} times (${conf}% confidence) — planning should counter this, not feed it.`;
    const evidence = [`Pattern: ${topPattern.pattern} (${mentions} mentions)`];
    paragraphs.push(text);
    evidenceStatements.push({ text, evidence });
  }

  const beliefs = bundle.mentorMemories.filter(
    (m) =>
      m.effectiveConfidence >= 0.45 &&
      ["belief", "self_talk", "thought"].includes(m.memoryType)
  );
  if (beliefs.length > 0) {
    const top = beliefs[0];
    const text = `You've told me: "${top.text}" (${top.mentionCount} mention${top.mentionCount > 1 ? "s" : ""}).`;
    paragraphs.push(text);
    evidenceStatements.push({ text, evidence: [`[${top.memoryType}] ${top.text}`] });
  }

  if (bundle.focusTitle && isConcreteInitiativeTitle(bundle.focusTitle)) {
    const text = `Right now you're executing on ${bundle.focusTitle}.`;
    paragraphs.push(text);
    evidenceStatements.push({ text, evidence: [`Current focus initiative: "${bundle.focusTitle}"`] });
  }

  if (bundle.completedTasks7d >= 3) {
    const text = `You completed ${bundle.completedTasks7d} tasks in the last 7 days — that's real execution data, not intent.`;
    paragraphs.push(text);
    evidenceStatements.push({
      text,
      evidence: [`${bundle.completedTasks7d} completed tasks (7d)`],
    });
  }

  const stillLearning =
    bundle.patterns.some((p) => /scatter|overthink/.test(p.pattern)) ||
    bundle.initiatives.length > 2
      ? "how you balance exploration with execution when several opportunities compete for your attention."
      : bundle.completedTasks7d < 3
        ? "what tends to derail your momentum when things get difficult."
        : "what a great execution week looks like for you when everything clicks.";

  const filtered = paragraphs.filter((p) => !GENERIC_BANNED.test(p));

  return {
    opening: filtered.length > 0 ? "From what you've actually logged:" : "I'm still building a picture of you:",
    paragraphs: filtered,
    stillLearning,
    evidenceStatements,
  };
}
