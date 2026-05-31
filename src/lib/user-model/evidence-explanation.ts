import type { UserModel } from "@/lib/user-model/types";
import { dedupeSemanticThemes } from "@/lib/user-model/theme-dedup";

const WHY_PATTERNS = [
  /\bwhy do you (think|believe|say|assume)\b/i,
  /\bwhy (do|does) (menai|you) think\b/i,
  /\bwhat('s| is) (that|this) based on\b/i,
  /\bhow do you know\b/i,
  /\bwhere did you get that\b/i,
  /\bwhat evidence\b/i,
];

export function isWhyBelieveQuestion(message: string): boolean {
  return WHY_PATTERNS.some((p) => p.test(message));
}

function topicFromMessage(message: string): string | null {
  const lower = message.toLowerCase();
  if (/entrepreneur|business|startup|saas|product/.test(lower)) return "entrepreneurship";
  if (/financial|wealth|freedom|money/.test(lower)) return "wealth";
  if (/real estate|property|realtor/.test(lower)) return "real_estate";
  if (/fitness|body fat|workout|health|weight/.test(lower)) return "fitness";
  if (/working style|execution|habits|discipline/.test(lower)) return "execution_style";
  if (/focus|priority|initiative/.test(lower)) return "focus";
  if (/motivat/.test(lower)) return "motivations";
  if (/decision/.test(lower)) return "decision_style";
  return null;
}

function goalsMatchingTopic(model: UserModel, topic: string): string[] {
  const all = [
    ...model.identity.longTermDirections,
    ...model.secondaryOutcomes.filter((o) => o.role === "direction").map((o) => o.title),
  ];
  const patterns: Record<string, RegExp> = {
    entrepreneurship: /business|startup|saas|entrepreneur|product|scalable/i,
    wealth: /financial|wealth|freedom|income|passive/i,
    real_estate: /real estate|property|realtor|rental/i,
    fitness: /body fat|fitness|workout|health|weight|fat/i,
  };
  const p = patterns[topic];
  if (!p) return all.slice(0, 4);
  return all.filter((g) => p.test(g));
}

export function buildEvidenceExplanation(model: UserModel, message: string): string {
  const topic = topicFromMessage(message);
  const lines: string[] = ["## Direct answer for \"Why do you believe that?\""];
  lines.push("Cite ONLY stored evidence. Use coach voice — no \"MenAI believes\" phrasing.");
  lines.push("Structure:");
  lines.push("Because:");
  lines.push("• [specific stored fact — goal title, initiative, task count, etc.]");
  lines.push("");
  lines.push("Then add one honest gap if inference is incomplete:");
  lines.push("\"It's still too early to tell whether...\"");

  if (topic === "entrepreneurship" || topic === "wealth") {
    const goals = goalsMatchingTopic(model, topic);
    if (goals.length > 0) {
      lines.push("");
      lines.push("Stored evidence for this inference:");
      for (const g of goals) lines.push(`• You added "${g}"`);
      const themes = dedupeSemanticThemes(goals);
      if (themes.includes("Business ownership")) {
        lines.push("");
        lines.push("Gap to acknowledge: It's still too early to tell whether entrepreneurship is your main career path or a side pursuit.");
      }
    }
  }

  if (topic === "fitness" || topic === "focus") {
    const focus = model.currentFocus.title;
    if (focus) lines.push(`• Current execution focus: "${focus}"`);
    if (model.primaryOutcome.headline) lines.push(`• Primary outcome: ${model.primaryOutcome.headline}`);
    for (const p of model.activePortfolio.filter((x) => x.isFocus)) {
      lines.push(`• Focus initiative in portfolio: "${p.title}"`);
    }
  }

  if (topic === "execution_style") {
    const execStmt = model.whoAmIStatements.find((s) =>
      /execution|working style|task/i.test(s.text)
    );
    if (execStmt) {
      lines.push("");
      lines.push("Relevant evidence:");
      for (const e of execStmt.evidence) lines.push(`• ${e}`);
    } else {
      lines.push("");
      lines.push("Honest answer: There isn't enough execution history yet — no completed tasks or reflections to cite.");
    }
  }

  if (model.evidence.length > 0) {
    lines.push("");
    lines.push("Full evidence on file (cite relevant items only):");
    for (const e of model.evidence.slice(0, 12)) lines.push(`• ${e}`);
  }

  const matchingStatements = topic
    ? model.whoAmIStatements.filter((s) => {
        const t = topic.toLowerCase();
        return s.text.toLowerCase().includes(t) || s.tag === "strong_inference";
      })
    : model.whoAmIStatements.filter((s) => s.tag !== "unknown");

  if (matchingStatements.length > 0) {
    lines.push("");
    lines.push("Tagged statements (internal — cite underlying evidence, not the tag):");
    for (const s of matchingStatements.slice(0, 4)) {
      lines.push(`- [${s.tag}] ${s.text}`);
      for (const e of s.evidence) lines.push(`  • ${e}`);
    }
  }

  return lines.join("\n");
}
