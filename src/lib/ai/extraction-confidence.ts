/** Heuristic confidence adjustment — tentative language must not become committed initiatives. */

const TENTATIVE_PATTERNS = [
  /\bthinking about\b/i,
  /\bconsidering\b/i,
  /\bmaybe\b/i,
  /\bmight\b/i,
  /\bperhaps\b/i,
  /\bsomeday\b/i,
  /\bone day\b/i,
  /\bbeen wondering\b/i,
  /\btoying with\b/i,
  /\bidea of\b/i,
  /\bthought about\b/i,
  /\bwhat if i\b/i,
  /\bi've been thinking\b/i,
  /\bnot sure if\b/i,
  /\bdebating whether\b/i,
];

const COMMITTED_PATTERNS = [
  /\bi'm building\b/i,
  /\bi am building\b/i,
  /\bi'm working on\b/i,
  /\bi am working on\b/i,
  /\bcommitted to\b/i,
  /\bstarting (a |my )?/i,
  /\blaunched\b/i,
  /\bi need to build\b/i,
  /\bmy focus is\b/i,
  /\bactively (working|building|preparing)\b/i,
];

export function isTentativeMessage(text: string): boolean {
  return TENTATIVE_PATTERNS.some((p) => p.test(text));
}

export function isCommittedMessage(text: string): boolean {
  return COMMITTED_PATTERNS.some((p) => p.test(text));
}

/** Cap confidence and phrase as a suggestion question when user is exploring, not committing. */
export function formatTentativeSuggestionTitle(name: string): string {
  let title = name.trim();
  title = title.replace(/^(build|launch|create|start)\s+/i, "Start ");
  if (!/^start /i.test(title)) {
    title = `Start ${title.charAt(0).toLowerCase()}${title.slice(1)}`;
  }
  title = title.replace(/\?+$/, "");
  return `${title}?`;
}

export function adjustProjectConfidence(
  sourceMessage: string,
  project: { name: string; status: string; confidence: number; context?: string }
): { name: string; status: string; confidence: number; context?: string; tentative: boolean } {
  let { name, status, confidence, context } = project;
  let tentative = false;

  if (isTentativeMessage(sourceMessage) || status === "idea") {
    tentative = true;
    confidence = Math.min(confidence, 0.68);
    status = "idea";
    name = formatTentativeSuggestionTitle(name);
    context = context || "User is exploring this idea — not yet committed.";
  } else if (isCommittedMessage(sourceMessage)) {
    confidence = Math.max(confidence, 0.88);
    status = status === "idea" ? "active" : status;
  }

  return { name, status, confidence, context, tentative };
}

export function adjustGoalConfidence(
  sourceMessage: string,
  goal: { title: string; confidence: number }
): { title: string; confidence: number; tentative: boolean } {
  let { title, confidence } = goal;
  let tentative = false;

  if (isTentativeMessage(sourceMessage)) {
    tentative = true;
    confidence = Math.min(confidence, 0.65);
    title = formatTentativeSuggestionTitle(title);
  }

  return { title, confidence, tentative };
}
