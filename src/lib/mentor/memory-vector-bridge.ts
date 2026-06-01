import type { MentorMemoryType } from "@/lib/mentor/mentor-memory";
import { storeMemory } from "@/lib/ai/orchestrator/memory-engine";

/** Natural-language vector content for semantic recall — not raw tags. */
export function mentorMemoryToVectorNarrative(
  memoryType: MentorMemoryType | string,
  text: string,
  evidenceCount: number
): string {
  const t = text.toLowerCase();

  if (memoryType === "core_value") {
    if (/freedom|independen/.test(t)) {
      return `User consistently values freedom and autonomy over traditional job security and stable employment. Evidence count: ${evidenceCount}. This is a core belief that persists across conversations.`;
    }
    if (/financial independence|financial freedom/.test(t)) {
      return `User wants financial independence and freedom from traditional employment constraints. Evidence count: ${evidenceCount}.`;
    }
    if (/fitness|gym|training|working out/.test(t)) {
      return `Fitness and physical discipline are recurring parts of how this user thinks about self-improvement — not vanity, but discipline. Evidence count: ${evidenceCount}.`;
    }
    if (/building/.test(t)) {
      return `User enjoys building things and creating — a recurring identity theme. Evidence count: ${evidenceCount}.`;
    }
    return `Core value on file: ${text}. Evidence count: ${evidenceCount}. This belief has been reinforced across multiple conversations.`;
  }

  if (memoryType === "direction") {
    if (/upsc|exam/.test(t)) {
      return `User's current life direction centers on UPSC exam preparation — this has become their primary pursuit. Evidence count: ${evidenceCount}.`;
    }
    if (/finance agency|agency/.test(t)) {
      return `User was previously focused on building a finance agency — this direction may have been superseded if they pivoted. Evidence count: ${evidenceCount}.`;
    }
    if (/business/.test(t)) {
      return `User has pursued building businesses and entrepreneurial direction. Evidence count: ${evidenceCount}. May be active or superseded depending on recent pivots.`;
    }
    return `Life direction: ${text}. Evidence count: ${evidenceCount}.`;
  }

  if (memoryType === "relationship_note") {
    return `Relationship context: ${text}. Evidence count: ${evidenceCount}. Ambition and personal relationships interact for this user.`;
  }

  if (memoryType === "opportunity") {
    return `Time-sensitive context: ${text}. Evidence count: ${evidenceCount}. May expire — check dates.`;
  }

  if (/overthink/.test(t)) {
    return `User recognizes a tendency to overthink — hesitation around committing to decisions. Evidence count: ${evidenceCount}.`;
  }

  return `${text}. Evidence count: ${evidenceCount}. Stored from mentor conversation analysis.`;
}

export function patternToVectorNarrative(
  pattern: string,
  evidenceCount: number,
  behavioralImpact?: string | null
): string {
  const label = pattern.replace(/_/g, " ");
  const impact = behavioralImpact || "This pattern affects execution when it appears.";
  return `Recurring behavioral pattern: ${label}. Appeared ${evidenceCount} times across conversations and reflections. ${impact}`;
}

/** Mirror structured mentor memory into pgvector layer for semantic retrieval. */
export function mirrorMentorMemoryToVector(input: {
  userId: string;
  memoryType: MentorMemoryType | string;
  text: string;
  evidenceCount: number;
  influenceScore: number;
  area?: string | null;
}): void {
  const narrative = mentorMemoryToVectorNarrative(
    input.memoryType,
    input.text,
    input.evidenceCount
  );

  storeMemory({
    userId: input.userId,
    content: narrative,
    memoryType:
      input.memoryType === "core_value" || input.memoryType === "direction"
        ? "insight"
        : "preference",
    importance: Math.min(0.98, input.influenceScore),
    metadata: {
      source: "mentor_memory_mirror",
      memoryType: input.memoryType,
      evidenceCount: input.evidenceCount,
      influenceScore: input.influenceScore,
      area: input.area ?? null,
    },
  }).catch(() => {});
}

export function mirrorPatternToVector(input: {
  userId: string;
  pattern: string;
  evidenceCount: number;
  influenceScore: number;
  behavioralImpact?: string | null;
}): void {
  storeMemory({
    userId: input.userId,
    content: patternToVectorNarrative(
      input.pattern,
      input.evidenceCount,
      input.behavioralImpact
    ),
    memoryType: "insight",
    importance: Math.min(0.98, input.influenceScore),
    metadata: {
      source: "pattern_mirror",
      pattern: input.pattern,
      evidenceCount: input.evidenceCount,
    },
  }).catch(() => {});
}
