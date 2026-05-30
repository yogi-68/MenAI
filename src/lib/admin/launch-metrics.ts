import { createServiceRoleClient } from "@/lib/supabase/server";
import { FAST_MODEL, DEEP_MODEL } from "@/lib/ai/models";

export interface LaunchMetricsSnapshot {
  periodDays: number;
  initiativeAcceptance: {
    shown: number;
    accepted: number;
    dismissed: number;
    pending: number;
    acceptanceRate: number;
    health: "weak" | "ok" | "strong";
  };
  taskCompletionByDomain: Array<{
    lifeArea: string;
    completed: number;
    planned: number;
    rate: number;
  }>;
  reflection: {
    planDays: number;
    reflectionDays: number;
    rate: number;
    health: "weak" | "ok" | "strong";
  };
  retention7Day: {
    signups: number;
    returned: number;
    rate: number;
    health: "weak" | "ok" | "strong";
  };
  models: { fast: string; deep: string };
}

function pct(num: number, den: number): number {
  return den > 0 ? Math.round((num / den) * 100) : 0;
}

function healthFromRate(rate: number, okMin: number, strongMin: number): "weak" | "ok" | "strong" {
  if (rate >= strongMin) return "strong";
  if (rate >= okMin) return "ok";
  return "weak";
}

export async function fetchLaunchMetrics(days = 30): Promise<LaunchMetricsSnapshot> {
  const db = await createServiceRoleClient();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceIso = since.toISOString();
  const sinceDate = sinceIso.split("T")[0];

  const [suggestionsRes, tasksRes, plansRes, reflectionsRes, signupEventsRes, returnEventsRes] =
    await Promise.all([
      db.from("ai_suggestions").select("status").gte("created_at", sinceIso),
      db
        .from("tasks")
        .select("status, due_date, initiatives(life_area)")
        .gte("due_date", sinceDate),
      db.from("daily_plans").select("plan_date").gte("plan_date", sinceDate),
      db.from("daily_reflections").select("reflection_date").gte("reflection_date", sinceDate),
      db.from("product_events").select("user_id, created_at").eq("event_name", "signup").gte("created_at", sinceIso),
      db
        .from("product_events")
        .select("user_id, created_at")
        .eq("event_name", "daily_return")
        .gte("created_at", sinceIso),
    ]);

  const suggestions = suggestionsRes.data || [];
  const accepted = suggestions.filter((s) => s.status === "accepted").length;
  const dismissed = suggestions.filter((s) => s.status === "dismissed").length;
  const pending = suggestions.filter((s) => s.status === "pending").length;
  const resolved = accepted + dismissed;
  const acceptanceRate = pct(accepted, resolved);

  const domainMap = new Map<string, { completed: number; planned: number }>();
  for (const t of tasksRes.data || []) {
    const area = (t.initiatives as { life_area?: string } | null)?.life_area || "personal";
    const cur = domainMap.get(area) || { completed: 0, planned: 0 };
    cur.planned += 1;
    if (t.status === "completed") cur.completed += 1;
    domainMap.set(area, cur);
  }

  const taskCompletionByDomain = [...domainMap.entries()]
    .map(([lifeArea, stats]) => ({
      lifeArea,
      completed: stats.completed,
      planned: stats.planned,
      rate: pct(stats.completed, stats.planned),
    }))
    .sort((a, b) => b.planned - a.planned);

  const planDays = (plansRes.data || []).length;
  const reflectionDays = (reflectionsRes.data || []).length;
  const reflectionRate = pct(reflectionDays, planDays);

  const signupUsers = new Set((signupEventsRes.data || []).map((r) => r.user_id));
  const signupDates = new Map<string, Date>();
  for (const r of signupEventsRes.data || []) {
    if (!signupDates.has(r.user_id)) {
      signupDates.set(r.user_id, new Date(r.created_at));
    }
  }

  let returned7 = 0;
  for (const userId of signupUsers) {
    const signupAt = signupDates.get(userId);
    if (!signupAt) continue;
    const userReturns = (returnEventsRes.data || []).filter((r) => r.user_id === userId);
    const hit = userReturns.some((r) => {
      const diff = Math.floor(
        (new Date(r.created_at).getTime() - signupAt.getTime()) / (1000 * 60 * 60 * 24)
      );
      return diff >= 6 && diff <= 8;
    });
    if (hit) returned7 += 1;
  }

  const retention7Rate = pct(returned7, signupUsers.size);

  return {
    periodDays: days,
    initiativeAcceptance: {
      shown: suggestions.length,
      accepted,
      dismissed,
      pending,
      acceptanceRate,
      health: healthFromRate(acceptanceRate, 30, 50),
    },
    taskCompletionByDomain,
    reflection: {
      planDays,
      reflectionDays,
      rate: reflectionRate,
      health: healthFromRate(reflectionRate, 20, 30),
    },
    retention7Day: {
      signups: signupUsers.size,
      returned: returned7,
      rate: retention7Rate,
      health: healthFromRate(retention7Rate, 25, 40),
    },
    models: { fast: FAST_MODEL, deep: DEEP_MODEL },
  };
}
