const BAD_TITLE_PATTERNS = [
  /^in the next \d+/i,
  /^within \d+\s*(day|week|month)/i,
  /^over the next/i,
  /^for the next/i,
  /^i want to/i,
  /^my goal is/i,
  /^i need to/i,
  /^i'm trying to/i,
  /^i am trying to/i,
  /^actively trying to achieve/i,
  /^what i want/i,
];

const VAGUE_ONLY = /^(goal|initiative|project|thing|stuff|work on it)$/i;

/** Short, actionable initiative title — not a sentence or timeframe. */
export function isBadInitiativeTitle(raw: string): boolean {
  const title = raw.trim();
  if (title.length < 3) return true;
  if (title.length > 80) return true;
  if (BAD_TITLE_PATTERNS.some((p) => p.test(title))) return true;
  if (VAGUE_ONLY.test(title)) return true;
  if (title.split(/\s+/).length > 10) return true;
  return false;
}

/** Extract a short title from a sentence like "In the next 30 days I want to launch MenAI". */
export function normalizeInitiativeTitle(raw: string): string {
  let t = raw.trim().replace(/\s+/g, " ");
  t = t.replace(/^in the next \d+\s*(days?|weeks?|months?)\s*,?\s*/i, "");
  t = t.replace(/^(i want to|my goal is to|i need to|i'm trying to|i am trying to)\s+/i, "");
  t = t.replace(/^(launch|build|complete|finish|reach|get to|achieve)\s+/i, (m) => m);
  if (t.length > 0) {
    t = t.charAt(0).toUpperCase() + t.slice(1);
  }
  if (t.length > 60) {
    t = t.slice(0, 57).trim() + "…";
  }
  return t;
}

export function validateInitiativeTitle(raw: string): {
  valid: boolean;
  title: string;
  error?: string;
} {
  const normalized = normalizeInitiativeTitle(raw);
  if (isBadInitiativeTitle(raw) && !isBadInitiativeTitle(normalized)) {
    return { valid: true, title: normalized };
  }
  if (isBadInitiativeTitle(normalized)) {
    return {
      valid: false,
      title: normalized,
      error:
        "Use a short initiative name (e.g. Launch MenAI Beta, Reach 20 Users, Lose 5 kg) — not a sentence or timeframe.",
    };
  }
  return { valid: true, title: normalized };
}
