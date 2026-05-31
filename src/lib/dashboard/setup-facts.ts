import type { SupabaseClient } from "@supabase/supabase-js";
import type { CoachBriefing } from "@/lib/plans/coach-insights";
import { getUserModel } from "@/lib/user-model/loader";
import { userModelToCoachBriefing } from "@/lib/user-model/format-for-prompt";

export type { CoachBriefing };

export async function buildDashboardCoachBriefing(
  supabase: SupabaseClient,
  userId: string,
  extras?: {
    whatMattersNow?: string | null;
    currentMilestone?: string | null;
  }
): Promise<CoachBriefing> {
  const model = await getUserModel(supabase, userId);
  const briefing = userModelToCoachBriefing(model);

  if (extras?.currentMilestone) {
    briefing.mattersToday = extras.currentMilestone;
  } else if (
    extras?.whatMattersNow &&
    model.currentFocus.title &&
    !extras.whatMattersNow.toLowerCase().includes(model.currentFocus.title.toLowerCase())
  ) {
    briefing.mattersToday = extras.whatMattersNow;
  }

  return briefing;
}

/** @deprecated Use coachBriefing from buildDashboardCoachBriefing */
export interface SetupFacts {
  directionCount: number;
  activeInitiatives: number;
  opportunityCount: number;
  plannedMilestones: number;
  bullets: string[];
  footer: string;
}

export async function buildSetupFacts(
  supabase: SupabaseClient,
  userId: string
): Promise<SetupFacts> {
  const briefing = await buildDashboardCoachBriefing(supabase, userId);
  return {
    directionCount: 0,
    activeInitiatives: briefing.tryingToAchieve ? 1 : 0,
    opportunityCount: 0,
    plannedMilestones: 0,
    bullets: briefing.understands,
    footer: briefing.insight,
  };
}
