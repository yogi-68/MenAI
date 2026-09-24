const FORBIDDEN_PERSONALITY_PATTERNS = [
  /\bthrives?\s+on\b/i,
  /\bdecisive action\b/i,
  /\baggressive work style\b/i,
  /\btangible progress\b/i,
  /\bcarving out a path\b/i,
  /\bidentity labels?\b/i,
  /\bdetermined\b/i,
  /\bhighly disciplined\b/i,
  /\bnaturally resilient\b/i,
  /\bjourney\b/i,
  /\bshapes your\b/i,
  /\bambitious\b/i,
  /\bgrit(ty)?\b/i,
  /\bintensity\b/i,
  /\bresilient\b/i,
  /\bdisciplined\b/i,
  /\bhard[- ]?working\b/i,
  /\bdriven\b/i,
  /\bpassionate\b/i,
];

const ROBOTIC_VOICE_PATTERNS = [
  /\bMettle (understands|believes|sees|thinks|currently knows)\b/i,
  /\bAccording to (available|current|stored)\b/i,
  /\bBased on (available|stored|your profile|current (data|context|knowledge))\b/i,
  /\bAccording to current (data|knowledge|context)\b/i,
];

const FORBIDDEN_PATTERNS = [...FORBIDDEN_PERSONALITY_PATTERNS, ...ROBOTIC_VOICE_PATTERNS];

export function containsForbiddenClaim(text: string): boolean {
  return FORBIDDEN_PATTERNS.some((p) => p.test(text));
}

export function containsPersonalityInference(text: string): boolean {
  return FORBIDDEN_PERSONALITY_PATTERNS.some((p) => p.test(text));
}

export function stripForbiddenClaims(text: string): string {
  if (!text?.trim()) return text;
  const sentences = text.split(/(?<=[.!?])\s+/);
  const kept = sentences.filter((s) => !containsForbiddenClaim(s));
  return kept.join(" ").trim();
}

export function stripRoboticVoice(text: string): string {
  if (!text?.trim()) return text;
  const sentences = text.split(/(?<=[.!?])\s+/);
  const kept = sentences.filter((s) => !ROBOTIC_VOICE_PATTERNS.some((p) => p.test(s)));
  return kept.join(" ").trim();
}

export function sanitizeCoachCopy(text: string): string {
  return stripRoboticVoice(stripForbiddenClaims(text));
}
