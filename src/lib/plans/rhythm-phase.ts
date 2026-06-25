export type RhythmPhase = "morning" | "afternoon" | "night";

export type UrgencyLevel = "calm" | "focused" | "direct" | "urgent";

export interface RhythmContext {
  phase: RhythmPhase;
  hour: number;
  urgency: UrgencyLevel;
  toneInstruction: string;
}

export interface ExecutionUrgencyInput {
  hour?: number;
  tasksCompletedToday: number;
  tasksDueToday: number;
  daysToNearestMilestone?: number | null;
}

export function getCurrentPhase(hour = new Date().getHours()): RhythmPhase {
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "night";
}

export function getExecutionUrgency(input: ExecutionUrgencyInput): UrgencyLevel {
  const hour = input.hour ?? new Date().getHours();
  const completionRate =
    input.tasksDueToday > 0 ? input.tasksCompletedToday / input.tasksDueToday : 1;
  const behind = completionRate < 0.33 && hour >= 15;
  const milestoneSoon =
    input.daysToNearestMilestone != null &&
    input.daysToNearestMilestone <= 7 &&
    input.daysToNearestMilestone >= 0;

  if (behind && milestoneSoon) return "urgent";
  if (behind) return "direct";
  if (hour >= 18) return "focused";
  if (hour < 12) return "calm";
  return "focused";
}

const TONE_BY_URGENCY: Record<UrgencyLevel, string> = {
  calm: "Morning planning tone — help them choose the highest-leverage 3 tasks per goal. Be clear, not soft.",
  focused: "Midday execution tone — check progress, renegotiate if needed, keep tasks finishable today.",
  direct: "Afternoon pressure — user is behind on today's tasks. Name what's undone, give one concrete next action per goal. No guilt, no fluff.",
  urgent: "Deadline pressure — milestone is within 7 days and tasks are incomplete. Be direct: what must ship today vs what waits.",
};

export function getRhythmContext(hour = new Date().getHours()): RhythmContext {
  const phase = getCurrentPhase(hour);
  return {
    phase,
    hour,
    urgency: "focused",
    toneInstruction: TONE_BY_URGENCY.focused,
  };
}

export function buildRhythmContext(input: ExecutionUrgencyInput): RhythmContext {
  const hour = input.hour ?? new Date().getHours();
  const phase = getCurrentPhase(hour);
  const urgency = getExecutionUrgency(input);
  return {
    phase,
    hour,
    urgency,
    toneInstruction: TONE_BY_URGENCY[urgency],
  };
}

export function formatRhythmBlockForPrompt(ctx: RhythmContext, input: ExecutionUrgencyInput): string {
  const lines = [
    `Phase: ${ctx.phase} (hour ${ctx.hour})`,
    `Tasks done today: ${input.tasksCompletedToday}/${Math.max(input.tasksDueToday, 1)}`,
  ];
  if (input.daysToNearestMilestone != null) {
    lines.push(`Nearest milestone: ${input.daysToNearestMilestone} days`);
  }
  lines.push(`Tone: ${ctx.toneInstruction}`);
  return lines.join("\n");
}
