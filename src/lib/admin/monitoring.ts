import { createServiceRoleClient } from "@/lib/supabase/server";
import { aggregateClaimQuality, type ClaimQualityScore } from "@/lib/ai/claim-quality";

export interface AdminMonitoringSnapshot {
  period: { today: string; monthStart: string };
  usage: {
    today: { calls: number; tokensIn: number; tokensOut: number; cost: number };
    month: { calls: number; tokensIn: number; tokensOut: number; cost: number };
    byFeature: Array<{ feature: string; calls: number; cost: number; tokens: number }>;
  };
  engagement: {
    totalUsers: number;
    plansGeneratedToday: number;
    reflectionsToday: number;
    activeInitiatives: number;
  };
  topUsers: Array<{
    userId: string;
    name: string;
    calls: number;
    cost: number;
    tokens: number;
  }>;
  recentCalls: Array<{
    id: string;
    feature: string;
    model: string;
    tokensIn: number;
    tokensOut: number;
    cost: number;
    createdAt: string;
    userName: string;
    ttftMs: number | null;
    durationMs: number | null;
  }>;
  chatPerformance: {
    today: { calls: number; avgTtftMs: number | null; avgDurationMs: number | null; interrupted: number };
    month: { calls: number; avgTtftMs: number | null; avgDurationMs: number | null; interrupted: number };
  };
  claimQuality: {
    chatResponsesScored: number;
    verified: number;
    inferred: number;
    unknown: number;
    unsupported: number;
    percentages: {
      verified: number;
      inferred: number;
      unknown: number;
      unsupported: number;
    };
  };
  budget: {
    monthlyLimitUsd: number;
    monthSpendUsd: number;
    percentUsed: number;
    alertLevel: "ok" | "soft" | "hard";
  };
}

function sumUsage(rows: Array<{ tokens_in?: number; tokens_out?: number; cost_estimate?: number }>) {
  return rows.reduce(
    (acc, row) => ({
      calls: acc.calls + 1,
      tokensIn: acc.tokensIn + (row.tokens_in ?? 0),
      tokensOut: acc.tokensOut + (row.tokens_out ?? 0),
      cost: acc.cost + Number(row.cost_estimate ?? 0),
    }),
    { calls: 0, tokensIn: 0, tokensOut: 0, cost: 0 }
  );
}

function avgMs(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((v): v is number => typeof v === "number" && v >= 0);
  if (nums.length === 0) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function chatPerfFromRows(rows: Array<{ ttft_ms?: number | null; duration_ms?: number | null }>) {
  return {
    calls: rows.length,
    avgTtftMs: avgMs(rows.map((r) => r.ttft_ms)),
    avgDurationMs: avgMs(rows.map((r) => r.duration_ms)),
    interrupted: rows.filter((r) => r.duration_ms == null).length,
  };
}

export async function fetchAdminMonitoring(): Promise<AdminMonitoringSnapshot> {
  const db = await createServiceRoleClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const todayIso = today.toISOString();
  const monthIso = monthStart.toISOString();

  const todayDate = todayIso.split("T")[0];

  const [
    usageTodayRes,
    usageMonthRes,
    recentRes,
    profilesRes,
    plansTodayRes,
    reflectionsTodayRes,
    initiativesRes,
    chatLatencyMonthRes,
  ] = await Promise.all([
    db.from("ai_usage_log").select("tokens_in, tokens_out, cost_estimate, feature").gte("created_at", todayIso),
    db.from("ai_usage_log").select("tokens_in, tokens_out, cost_estimate, feature, user_id").gte("created_at", monthIso),
    db
      .from("ai_usage_log")
      .select("id, feature, model, tokens_in, tokens_out, cost_estimate, created_at, user_id, ttft_ms, duration_ms")
      .order("created_at", { ascending: false })
      .limit(25),
    db.from("profiles").select("id, full_name"),
    db.from("daily_plans").select("id", { count: "exact", head: true }).eq("plan_date", todayDate),
    db.from("daily_reflections").select("id", { count: "exact", head: true }).eq("reflection_date", todayDate),
    db.from("initiatives").select("id", { count: "exact", head: true }).eq("status", "active"),
    db
      .from("ai_usage_log")
      .select("ttft_ms, duration_ms, created_at, metadata")
      .eq("feature", "chat")
      .gte("created_at", monthIso),
  ]);

  const usageToday = sumUsage(usageTodayRes.data || []);
  const usageMonth = sumUsage(usageMonthRes.data || []);

  const byFeatureMap = new Map<string, { calls: number; cost: number; tokens: number }>();
  for (const row of usageMonthRes.data || []) {
    const key = row.feature || "unknown";
    const cur = byFeatureMap.get(key) || { calls: 0, cost: 0, tokens: 0 };
    cur.calls += 1;
    cur.cost += Number(row.cost_estimate ?? 0);
    cur.tokens += (row.tokens_in ?? 0) + (row.tokens_out ?? 0);
    byFeatureMap.set(key, cur);
  }

  const profileMap = new Map(
    (profilesRes.data || []).map((p) => [p.id, p.full_name || "Unknown"])
  );

  const userTotals = new Map<string, { calls: number; cost: number; tokens: number }>();
  for (const row of usageMonthRes.data || []) {
    const cur = userTotals.get(row.user_id) || { calls: 0, cost: 0, tokens: 0 };
    cur.calls += 1;
    cur.cost += Number(row.cost_estimate ?? 0);
    cur.tokens += (row.tokens_in ?? 0) + (row.tokens_out ?? 0);
    userTotals.set(row.user_id, cur);
  }

  const topUsers = [...userTotals.entries()]
    .map(([userId, stats]) => ({
      userId,
      name: profileMap.get(userId) || userId.slice(0, 8),
      ...stats,
    }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 10);

  const monthlyLimitUsd = Number(process.env.AI_MONTHLY_BUDGET_USD || 100);
  const percentUsed = monthlyLimitUsd > 0 ? (usageMonth.cost / monthlyLimitUsd) * 100 : 0;
  const alertLevel =
    percentUsed >= 100 ? "hard" : percentUsed >= 80 ? "soft" : "ok";

  const chatMonthRows = chatLatencyMonthRes.data || [];
  const chatTodayRows = chatMonthRows.filter((r) => r.created_at >= todayIso);

  const claimRows = chatMonthRows
    .map((r) => (r.metadata as { claimQuality?: ClaimQualityScore } | null)?.claimQuality)
    .filter(Boolean) as ClaimQualityScore[];
  const claimAgg = aggregateClaimQuality(claimRows.map((q) => ({ claimQuality: q })));

  return {
    period: {
      today: todayIso.split("T")[0],
      monthStart: monthIso.split("T")[0],
    },
    usage: {
      today: usageToday,
      month: usageMonth,
      byFeature: [...byFeatureMap.entries()]
        .map(([feature, stats]) => ({ feature, ...stats }))
        .sort((a, b) => b.cost - a.cost),
    },
    engagement: {
      totalUsers: profilesRes.data?.length ?? 0,
      plansGeneratedToday: plansTodayRes.count ?? 0,
      reflectionsToday: reflectionsTodayRes.count ?? 0,
      activeInitiatives: initiativesRes.count ?? 0,
    },
    topUsers,
    recentCalls: (recentRes.data || []).map((row) => ({
      id: row.id,
      feature: row.feature,
      model: row.model,
      tokensIn: row.tokens_in ?? 0,
      tokensOut: row.tokens_out ?? 0,
      cost: Number(row.cost_estimate ?? 0),
      createdAt: row.created_at,
      userName: profileMap.get(row.user_id) || "Unknown",
      ttftMs: row.ttft_ms ?? null,
      durationMs: row.duration_ms ?? null,
    })),
    chatPerformance: {
      today: chatPerfFromRows(chatTodayRows),
      month: chatPerfFromRows(chatMonthRows),
    },
    claimQuality: {
      chatResponsesScored: claimRows.length,
      verified: claimAgg.verified,
      inferred: claimAgg.inferred,
      unknown: claimAgg.unknown,
      unsupported: claimAgg.unsupported,
      percentages: claimAgg.percentages,
    },
    budget: {
      monthlyLimitUsd,
      monthSpendUsd: usageMonth.cost,
      percentUsed: Math.round(percentUsed * 10) / 10,
      alertLevel,
    },
  };
}
