import type { SupabaseClient } from "@supabase/supabase-js";
import { recordPatternMention } from "@/lib/mentor/weakness-engine";
import { persistMentorMemories, type MentorMemory } from "@/lib/mentor/mentor-memory";

export interface ReflectionInput {
  movedForward: string;
  blockedBy: string;
  tomorrowContext: string;
}

const BLOCKER_PATTERNS: Array<{
  re: RegExp;
  pattern: string;
  impact: string;
  memory?: MentorMemory;
}> = [
  {
    re: /\bmeeting|calendar|calls?\b.*\b(took|ate|filled|most of)\b|\breactive\b|\bback-to-back\b/i,
    pattern: "reactive_schedule",
    impact: "Meetings and reactive work crowd out deep execution",
    memory: { memoryType: "pattern_mention", text: "Meetings and calendar eat execution time", confidence: 0.81 },
  },
  {
    re: /\bprocrastinat|put (it )?off|delayed|kept avoiding\b/i,
    pattern: "procrastination",
    impact: "Important work gets postponed to later",
  },
  {
    re: /\boverthink|research(ed)? too|planning instead|analysis\b/i,
    pattern: "overthinking",
    impact: "Gathering information instead of testing assumptions",
  },
  {
    re: /\bdistract|social media|scroll|phone\b/i,
    pattern: "distraction",
    impact: "Attention fragments before high-value work completes",
  },
  {
    re: /\btired|exhaust|burned out|poor sleep|didn't sleep\b/i,
    pattern: "burnout",
    impact: "Low energy reduces follow-through on planned work",
  },
  {
    re: /\bunclear|didn't know|confus|too many priorities|scattered\b/i,
    pattern: "scattered_focus",
    impact: "Unclear priorities pull focus away from the current initiative",
  },
  {
    re: /\bperfection|not good enough|kept polish|redo\b/i,
    pattern: "perfectionism",
    impact: "Perfectionism blocks shipping good-enough work",
  },
];

function detectReflectionPatterns(text: string): typeof BLOCKER_PATTERNS {
  return BLOCKER_PATTERNS.filter(({ re }) => re.test(text));
}

/** Extract patterns and beliefs from end-of-day reflection — strengthens memory. */
export async function ingestReflectionSignals(
  supabase: SupabaseClient,
  userId: string,
  input: ReflectionInput
): Promise<{ patterns: string[] }> {
  const corpus = [input.blockedBy, input.movedForward, input.tomorrowContext].join(" ");
  const hits = detectReflectionPatterns(corpus);
  const patterns: string[] = [];

  for (const hit of hits) {
    patterns.push(hit.pattern);
    await recordPatternMention(supabase, userId, hit.pattern, "reflection", hit.impact);
    if (hit.memory) {
      await persistMentorMemories(supabase, userId, [hit.memory], "reflection");
    }
  }

  if (input.blockedBy.trim().length > 12 && hits.length === 0) {
    await persistMentorMemories(
      supabase,
      userId,
      [
        {
          memoryType: "thought",
          text: `Blocker today: ${input.blockedBy.trim().slice(0, 160)}`,
          confidence: 0.78,
        },
      ],
      "reflection"
    );
  }

  if (input.movedForward.trim().length > 12) {
    await persistMentorMemories(
      supabase,
      userId,
      [
        {
          memoryType: "thought",
          text: `What moved forward: ${input.movedForward.trim().slice(0, 160)}`,
          confidence: 0.75,
        },
      ],
      "reflection"
    );
  }

  return { patterns };
}
