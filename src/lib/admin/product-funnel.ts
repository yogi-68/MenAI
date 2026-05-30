import { createServiceRoleClient } from "@/lib/supabase/server";

export interface ProductFunnelSnapshot {
  totals: {
    signups: number;
    onboardingCompleted: number;
    firstInitiative: number;
    firstPlan: number;
    taskCompleted: number;
    reflectionSubmitted: number;
  };
  rates: {
    signupToOnboarding: number;
    onboardingToInitiative: number;
    initiativeToPlan: number;
    planToTaskComplete: number;
    reflectionRate: number;
  };
  retention: {
    day2: number;
    day7: number;
  };
}

function pct(num: number, den: number): number {
  return den > 0 ? Math.round((num / den) * 100) : 0;
}

export async function fetchProductFunnel(): Promise<ProductFunnelSnapshot> {
  const db = await createServiceRoleClient();
  const d30 = new Date();
  d30.setDate(d30.getDate() - 30);
  const since = d30.toISOString();

  const { data: events } = await db
    .from("product_events")
    .select("user_id, event_name, created_at")
    .gte("created_at", since);

  const rows = events || [];
  const usersFor = (name: string) => new Set(rows.filter((r) => r.event_name === name).map((r) => r.user_id));

  const signups = usersFor("signup");
  const onboarding = usersFor("onboarding_completed");
  const initiatives = usersFor("first_initiative_created");
  const plans = usersFor("first_plan_generated");
  const tasks = usersFor("task_completed");
  const reflections = usersFor("reflection_submitted");

  // Day-2 / day-7 retention from daily_return events vs signups
  const signupDates = new Map<string, string>();
  for (const r of rows.filter((e) => e.event_name === "signup")) {
    signupDates.set(r.user_id, r.created_at.split("T")[0]);
  }

  let day2 = 0;
  let day7 = 0;
  const returns = rows.filter((e) => e.event_name === "daily_return");
  for (const [userId, signupDate] of signupDates) {
    const signup = new Date(signupDate);
    for (const ret of returns.filter((r) => r.user_id === userId)) {
      const diff = Math.floor(
        (new Date(ret.created_at).getTime() - signup.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (diff >= 1 && diff <= 2) day2 += 1;
      if (diff >= 6 && diff <= 8) day7 += 1;
    }
  }

  const signupCount = signups.size;

  return {
    totals: {
      signups: signupCount,
      onboardingCompleted: onboarding.size,
      firstInitiative: initiatives.size,
      firstPlan: plans.size,
      taskCompleted: tasks.size,
      reflectionSubmitted: reflections.size,
    },
    rates: {
      signupToOnboarding: pct(onboarding.size, signupCount),
      onboardingToInitiative: pct(initiatives.size, onboarding.size),
      initiativeToPlan: pct(plans.size, initiatives.size),
      planToTaskComplete: pct(tasks.size, plans.size),
      reflectionRate: pct(reflections.size, plans.size),
    },
    retention: {
      day2: pct(day2, signupCount),
      day7: pct(day7, signupCount),
    },
  };
}
