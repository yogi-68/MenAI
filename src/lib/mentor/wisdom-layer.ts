import type { UserIntent } from "@/lib/ai/orchestrator/types";
import type { UserModel } from "@/lib/user-model/types";

export type WisdomSignal =
  | "burnout"
  | "exhaustion"
  | "doubt"
  | "overwhelm"
  | "loss_of_motivation"
  | "none";

const EXHAUSTION_RE =
  /\b(exhausted|burnt out|burned out|drained|depleted|no energy|running on empty|so tired|wiped out)\b/i;
const DOUBT_RE =
  /\b(doubt myself|not sure (if|whether)|maybe i('m| am) not|imposter|don't think i can|can't do this)\b/i;
const OVERWHELM_RE = /\b(overwhelm|too much|everything at once|drowning|can't keep up)\b/i;
const MOTIVATION_LOSS_RE =
  /\b(lost motivation|don't care anymore|what's the point|why bother|don't feel like)\b/i;

export function detectWisdomSignal(message: string, intent?: UserIntent): WisdomSignal {
  const lower = message.toLowerCase();
  if (intent?.type === "BURNOUT_SIGNAL" || EXHAUSTION_RE.test(lower)) return "burnout";
  if (intent?.type === "EXECUTION_BLOCK") return "doubt";
  if (DOUBT_RE.test(lower)) return "doubt";
  if (OVERWHELM_RE.test(lower)) return "overwhelm";
  if (MOTIVATION_LOSS_RE.test(lower)) return "loss_of_motivation";
  if (/\b(tired|fatigue|need a break)\b/i.test(lower)) return "exhaustion";
  return "none";
}

export function needsWisdomFirst(message: string, intent?: UserIntent): boolean {
  return detectWisdomSignal(message, intent) !== "none";
}

/** Injected when user shares state of mind — wisdom before tasks. */
export function buildWisdomGuidance(
  message: string,
  intent: UserIntent | undefined,
  userModel?: UserModel | null
): string | null {
  const signal = detectWisdomSignal(message, intent);
  if (signal === "none") return null;

  const recentPush =
    (userModel?.executionStats?.completedTasks7d ?? 0) >= 5
      ? "You've been pushing hard recently."
      : null;
  const focus = userModel?.currentFocus?.title
    ? `Current focus: ${userModel.currentFocus.title}.`
    : null;
  const topPattern = userModel?.obstacles?.[0] || null;

  const base = `## Wisdom first (mandatory — do NOT push milestones or tasks yet)

Humans experience: thought → doubt → decision → action.
NOT: initiative → milestone → task checklist.

The user is sharing inner state. Your job is WISDOM, not productivity software.

FORBIDDEN responses:
- "Let's complete your milestone"
- "Here's your plan for today"
- "You should focus on..."
- Jumping to tasks without understanding their state

REQUIRED flow:
1. Acknowledge what they're carrying (${signal.replace(/_/g, " ")})
2. ${recentPush ? `Reference recent effort if relevant: "${recentPush}"` : "Notice the human cost, not the backlog"}
3. Ask ONE clarifying question to distinguish the root cause
4. Only after they answer — suggest a gentle next step (if any)

Clarifying question examples:
- "Before we change the plan — is this physical tiredness, mental overload, or loss of motivation?"
- "Is this exhaustion from pushing hard, or from working on the wrong thing?"
- "What would 'enough for today' look like if you gave yourself permission to do less?"

${focus ? `Context (background only — do not lead with it): ${focus}` : ""}
${topPattern ? `Known friction: ${topPattern}` : ""}

Keep it 3-5 sentences. Sound like a mentor who remembers them, not a planner completing a ticket.`;

  return base;
}

export const MENTOR_EXPERIENCE_RULE = `## Human experience (mandatory)
Users live through: thought → problem → doubt → idea → decision → action.
Never expose the internal system (direction → initiative → milestone → plan) in conversation.
Translate structure into human language:
- initiative → "what you're building right now"
- milestone → "the next thing that would prove progress"
- plan → "what actually matters today"
- reflection → "what slowed you down"

When in doubt: listen first, interpret second, act third.`;
