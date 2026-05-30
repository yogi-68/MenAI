import { isFinishableTodayTask, isVagueTask } from "@/lib/tasks/finishable-today";

/** Generic templates that feel like AI slop — reject in daily plans. */
const LOW_QUALITY_PATTERNS = [
  /^research (competitors|market|options)/i,
  /^review (progress|goals|plan)/i,
  /^plan (your|the|my) (day|week|goals)/i,
  /^brainstorm/i,
  /^think about/i,
  /^explore options/i,
  /^read about/i,
  /^learn about/i,
  /^optimize/i,
  /^strategy session/i,
  /^set up (a )?plan/i,
  /^define (your|my) (vision|strategy)/i,
  /^work on (the )?(project|initiative)/i,
  /^make (more )?progress/i,
  /^continue (working|building)/i,
  /^update (your|my) (plan|goals)/i,
];

export function isLowQualityTask(title: string): boolean {
  const t = title.trim();
  if (isVagueTask(t)) return true;
  if (LOW_QUALITY_PATTERNS.some((p) => p.test(t))) return true;
  if (t.split(/\s+/).length <= 2) return true;
  return false;
}

export function passesTaskQualityGate(title: string): boolean {
  return isFinishableTodayTask(title) && !isLowQualityTask(title);
}

export const TASK_QUALITY_PROMPT = `
TASK QUALITY (users judge the entire app by today's tasks):
- Each task = ONE physical action completable before bed with a yes/no done check.
- Tie every task to the current in_progress milestone — name the milestone in whyItMatters.
- Prefer verbs: Send, Write, Complete, Record, Publish, Call, Walk, Finish, Submit.
- BAD: "Research competitors", "Work on project", "Improve fitness", "Plan strategy"
- GOOD (business): "Send 3 cold emails to restaurant owners"
- GOOD (health): "Log every meal in MyFitnessPal today"
- GOOD (learning): "Complete 40 UPSC polity MCQs and mark weak topics"
- GOOD (creator): "Record a 60-second hook for video #1"
- If overthinking pattern is active: action tasks only, zero research/planning tasks.
`.trim();
