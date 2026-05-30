"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "@/lib/store";
import { Activity, AlertTriangle, Cpu, DollarSign, Users, Zap, Timer, Target, TrendingUp } from "lucide-react";

function fmtMs(ms: number | null) {
  if (ms === null) return "—";
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${ms}ms`;
}

function fmtUsd(n: number) {
  return `$${n.toFixed(4)}`;
}

function fmtTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export default function AdminMonitoringPage() {
  const router = useRouter();
  const { user } = useAppStore();

  useEffect(() => {
    if (user && user.role !== "admin") {
      router.replace("/dashboard");
    }
  }, [user, router]);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-monitoring"],
    queryFn: async () => {
      const res = await fetch("/api/admin/monitoring");
      if (res.status === 403) {
        router.replace("/dashboard");
        throw new Error("Forbidden");
      }
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
    enabled: user?.role === "admin",
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  if (!user || user.role !== "admin") {
    return (
      <div className="page-shell">
        <div className="skeleton shimmer" style={{ height: 200, borderRadius: 8 }} />
      </div>
    );
  }

  return (
    <div className="page-shell">
      <header style={{ marginBottom: "32px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)", fontWeight: 500, letterSpacing: "-0.02em", display: "flex", alignItems: "center", gap: "10px" }}>
            <Activity size={24} style={{ color: "var(--accent-primary)" }} />
            Admin Monitoring
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginTop: "6px" }}>
            AI usage, costs, and engagement — not visible to regular users.
          </p>
        </div>
        <button className="btn-secondary" onClick={() => refetch()} disabled={isFetching} style={{ padding: "8px 16px", fontSize: "0.85rem" }}>
          {isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      {isLoading && (
        <div className="skeleton shimmer" style={{ height: 320, borderRadius: 8 }} />
      )}

      {error && (
        <div className="glass-card" style={{ padding: "20px", color: "#ef4444" }}>
          Could not load monitoring data.
        </div>
      )}

      {data && (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {data.budget.alertLevel !== "ok" && (
            <div
              className="glass-card"
              style={{
                padding: "16px 20px",
                borderLeft: `3px solid ${data.budget.alertLevel === "hard" ? "#ef4444" : "#f59e0b"}`,
                display: "flex",
                alignItems: "center",
                gap: "12px",
              }}
            >
              <AlertTriangle size={18} style={{ color: data.budget.alertLevel === "hard" ? "#ef4444" : "#f59e0b" }} />
              <span style={{ fontSize: "0.9rem" }}>
                Monthly AI spend at {data.budget.percentUsed}% of ${data.budget.monthlyLimitUsd} budget
                {data.budget.alertLevel === "hard" ? " — hard limit reached" : " — soft alert"}
              </span>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
            <StatCard icon={DollarSign} label="Cost today" value={fmtUsd(data.usage.today.cost)} sub={`${data.usage.today.calls} calls`} />
            <StatCard icon={DollarSign} label="Cost this month" value={fmtUsd(data.usage.month.cost)} sub={`${data.usage.month.calls} calls`} />
            <StatCard icon={Cpu} label="Tokens today" value={fmtTokens(data.usage.today.tokensIn + data.usage.today.tokensOut)} sub="in + out" />
            <StatCard icon={Users} label="Users" value={String(data.engagement.totalUsers)} sub={`${data.engagement.activeInitiatives} active initiatives`} />
            <StatCard icon={Zap} label="Plans today" value={String(data.engagement.plansGeneratedToday)} sub={`${data.engagement.reflectionsToday} reflections`} />
          </div>

          <section className="glass-card" style={{ padding: "24px" }}>
            <h2 style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
              <Timer size={14} />
              Chat performance (admin only)
            </h2>
            {data.chatPerformance ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px" }}>
                <LatencyStat label="Avg TTFT today" value={fmtMs(data.chatPerformance.today.avgTtftMs)} sub={`${data.chatPerformance.today.calls} chats`} />
                <LatencyStat label="Avg response today" value={fmtMs(data.chatPerformance.today.avgDurationMs)} sub={`${data.chatPerformance.today.interrupted} interrupted`} />
                <LatencyStat label="Avg TTFT (month)" value={fmtMs(data.chatPerformance.month.avgTtftMs)} sub={`${data.chatPerformance.month.calls} chats`} />
                <LatencyStat label="Avg response (month)" value={fmtMs(data.chatPerformance.month.avgDurationMs)} sub={`${data.chatPerformance.month.interrupted} interrupted`} />
              </div>
            ) : (
              <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>No chat latency data yet.</p>
            )}
          </section>

          <section className="glass-card" style={{ padding: "24px" }}>
            <h2 style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "16px" }}>
              Product funnel (30 days)
            </h2>
            {data.funnel ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "16px" }}>
                <FunnelStat label="Signups" value={data.funnel.totals.signups} rate={null} />
                <FunnelStat label="Onboarding done" value={data.funnel.totals.onboardingCompleted} rate={data.funnel.rates.signupToOnboarding} />
                <FunnelStat label="First initiative" value={data.funnel.totals.firstInitiative} rate={data.funnel.rates.onboardingToInitiative} />
                <FunnelStat label="First plan" value={data.funnel.totals.firstPlan} rate={data.funnel.rates.initiativeToPlan} />
                <FunnelStat label="Task completed" value={data.funnel.totals.taskCompleted} rate={data.funnel.rates.planToTaskComplete} />
                <FunnelStat label="Reflection" value={data.funnel.totals.reflectionSubmitted} rate={data.funnel.rates.reflectionRate} />
                <FunnelStat label="Day-2 retention" value={`${data.funnel.retention.day2}%`} rate={null} />
                <FunnelStat label="Day-7 retention" value={`${data.funnel.retention.day7}%`} rate={null} />
              </div>
            ) : (
              <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>No funnel data yet.</p>
            )}
          </section>

          <section className="glass-card" style={{ padding: "24px" }}>
            <h2 style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
              <Target size={14} />
              Launch KPIs ({data.launchMetrics?.periodDays ?? 30} days)
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginBottom: "16px" }}>
              Monitor before scaling — models: fast {data.launchMetrics?.models?.fast ?? "—"} · deep {data.launchMetrics?.models?.deep ?? "—"}
            </p>
            {data.launchMetrics ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px" }}>
                  <LaunchKpi
                    label="Initiative acceptance"
                    value={`${data.launchMetrics.initiativeAcceptance.acceptanceRate}%`}
                    sub={`${data.launchMetrics.initiativeAcceptance.accepted} accepted / ${data.launchMetrics.initiativeAcceptance.dismissed + data.launchMetrics.initiativeAcceptance.accepted} resolved · ${data.launchMetrics.initiativeAcceptance.pending} pending`}
                    health={data.launchMetrics.initiativeAcceptance.health}
                    hint="Target ≥30%. Below = weak extraction."
                  />
                  <LaunchKpi
                    label="Reflection completion"
                    value={`${data.launchMetrics.reflection.rate}%`}
                    sub={`${data.launchMetrics.reflection.reflectionDays} reflections / ${data.launchMetrics.reflection.planDays} plan days`}
                    health={data.launchMetrics.reflection.health}
                    hint="Target ≥30% night reflection rate."
                  />
                  <LaunchKpi
                    label="7-day return rate"
                    value={`${data.launchMetrics.retention7Day.rate}%`}
                    sub={`${data.launchMetrics.retention7Day.returned} / ${data.launchMetrics.retention7Day.signups} signups`}
                    health={data.launchMetrics.retention7Day.health}
                    hint="Most important retention signal."
                  />
                </div>

                {data.launchMetrics.taskCompletionByDomain.length > 0 && (
                  <div>
                    <h3 style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px" }}>
                      <TrendingUp size={12} />
                      Task completion by domain
                    </h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {data.launchMetrics.taskCompletionByDomain.map((row: { lifeArea: string; completed: number; planned: number; rate: number }) => (
                        <div key={row.lifeArea} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem", gap: "12px", flexWrap: "wrap" }}>
                          <span style={{ textTransform: "capitalize" }}>{row.lifeArea.replace(/_/g, " ")}</span>
                          <span style={{ color: "var(--text-muted)" }}>
                            {row.rate}% · {row.completed}/{row.planned} tasks
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>No launch metrics yet.</p>
            )}
          </section>

          <section className="glass-card" style={{ padding: "24px" }}>
            <h2 style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "16px" }}>
              Usage by feature (this month)
            </h2>
            {data.usage.byFeature.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>No AI calls logged yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {data.usage.byFeature.map((row: { feature: string; calls: number; cost: number; tokens: number }) => (
                  <div key={row.feature} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.9rem", gap: "12px", flexWrap: "wrap" }}>
                    <span style={{ color: "var(--text-primary)" }}>{row.feature.replace(/_/g, " ")}</span>
                    <span style={{ color: "var(--text-muted)" }}>
                      {row.calls} calls · {fmtTokens(row.tokens)} tok · {fmtUsd(row.cost)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px" }}>
            <section className="glass-card" style={{ padding: "24px" }}>
              <h2 style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "16px" }}>
                Top users (month)
              </h2>
              {data.topUsers.length === 0 ? (
                <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>No usage yet.</p>
              ) : (
                data.topUsers.map((u: { userId: string; name: string; calls: number; cost: number }) => (
                  <div key={u.userId} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border-color)", fontSize: "0.88rem" }}>
                    <span>{u.name}</span>
                    <span style={{ color: "var(--text-muted)" }}>{u.calls} · {fmtUsd(u.cost)}</span>
                  </div>
                ))
              )}
            </section>

            <section className="glass-card" style={{ padding: "24px" }}>
              <h2 style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "16px" }}>
                Recent AI calls
              </h2>
              {data.recentCalls.length === 0 ? (
                <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>No recent calls.</p>
              ) : (
                data.recentCalls.slice(0, 12).map((call: { id: string; feature: string; userName: string; cost: number; tokensIn: number; tokensOut: number; createdAt: string; ttftMs?: number | null; durationMs?: number | null }) => (
                  <div key={call.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border-color)", fontSize: "0.82rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                      <span>{call.feature.replace(/_/g, " ")} · {call.userName}</span>
                      <span style={{ color: "var(--text-muted)" }}>{fmtUsd(call.cost)}</span>
                    </div>
                    <div style={{ color: "var(--text-muted)", marginTop: "2px" }}>
                      {new Date(call.createdAt).toLocaleString()} · {call.tokensIn + call.tokensOut} tok
                      {call.feature === "chat" && (call.ttftMs != null || call.durationMs != null) && (
                        <> · TTFT {fmtMs(call.ttftMs ?? null)} · {fmtMs(call.durationMs ?? null)}</>
                      )}
                    </div>
                  </div>
                ))
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

function LaunchKpi({
  label,
  value,
  sub,
  health,
  hint,
}: {
  label: string;
  value: string;
  sub: string;
  health: "weak" | "ok" | "strong";
  hint: string;
}) {
  const color = health === "strong" ? "#22c55e" : health === "ok" ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ padding: "12px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
        <span style={{ fontSize: "0.65rem", fontWeight: 600, color, textTransform: "uppercase", letterSpacing: "0.04em" }}>{health}</span>
      </div>
      <div style={{ fontSize: "1.25rem", fontWeight: 500 }}>{value}</div>
      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>{sub}</div>
      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "4px", opacity: 0.85 }}>{hint}</div>
    </div>
  );
}

function LatencyStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: "1.25rem", fontWeight: 500, marginTop: "4px" }}>{value}</div>
      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>{sub}</div>
    </div>
  );
}

function FunnelStat({ label, value, rate }: { label: string; value: number | string; rate: number | null }) {
  return (
    <div>
      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: "1.25rem", fontWeight: 500, marginTop: "4px" }}>{value}</div>
      {rate !== null && <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>{rate}% conversion</div>}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="glass-card" style={{ padding: "20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", color: "var(--text-muted)" }}>
        <Icon size={16} />
        <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
      </div>
      <div style={{ fontSize: "1.35rem", fontWeight: 500 }}>{value}</div>
      <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "4px" }}>{sub}</div>
    </div>
  );
}
