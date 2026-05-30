"use client";

import { createClient } from "@/lib/supabase/client";
import { useAppStore } from "@/lib/store";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Zap, MessageSquare, Calendar, Target, History } from "lucide-react";
import { AiSuggestionsBanner } from "@/components/dashboard/ai-suggestions";

interface TodayPayload {
  greeting: string;
  whatMattersNow: string | null;
  coachBriefing: {
    tryingToAchieve: string | null;
    understands: string[];
    stillNeeds: string[];
    insight: string;
    mattersToday: string | null;
    recentActivity: string | null;
  } | null;
  currentFocus: {
    title: string;
    until: string | null;
    coachInsight?: string;
    health: { label: string; reason: string; health: string };
  } | null;
  focusTasks: Array<{ id: string; title: string; status: string }>;
  hasPlan: boolean;
  initiatives: Array<{ id: string; title: string; lifeArea: string; progress: number }>;
  topMomentumInitiative: string | null;
  hasInitiatives: boolean;
  maturityLevel: string;
  isEmptyState?: boolean;
}

export default function DashboardOverview() {
  const { user } = useAppStore();
  const supabase = createClient();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);

  useEffect(() => {
    const checkOnboarding = async () => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser) {
        router.replace("/login");
        return;
      }
      const { data: progress } = await supabase
        .from("onboarding_progress")
        .select("completed_at")
        .eq("user_id", authUser.id)
        .maybeSingle();
      if (!progress?.completed_at) {
        router.replace("/onboarding");
        return;
      }
      setCheckingOnboarding(false);
    };
    checkOnboarding();
  }, [supabase, router]);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-today"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard/today");
      if (!res.ok) throw new Error("Failed to load");
      return res.json() as Promise<TodayPayload>;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const toggleTask = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const newStatus = status === "completed" ? "pending" : "completed";
      await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: newStatus }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-today"] });
    },
  });

  if (checkingOnboarding) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="skeleton shimmer" style={{ width: 200, height: 40, borderRadius: 8 }} />
      </div>
    );
  }

  const isNew = data?.maturityLevel === "new";
  const showEmptySetup = !isLoading && !data?.hasInitiatives;

  return (
    <div className="page-shell">
      <header className="animate-fade-in" style={{ marginBottom: "40px" }}>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Today
        </p>
        <h1 suppressHydrationWarning style={{ fontSize: "clamp(1.75rem, 4vw, 2.25rem)", fontWeight: 400, letterSpacing: "-0.03em" }}>
          {isLoading ? `${user?.full_name?.split(" ")[0] || "there"}.` : data?.greeting}
        </h1>
        {showEmptySetup ? (
          <p style={{ color: "var(--text-primary)", fontSize: "1.1rem", marginTop: "12px", fontWeight: 400, lineHeight: 1.6, maxWidth: 640 }}>
            Let&apos;s define your first initiative.
          </p>
        ) : data?.whatMattersNow && data.hasInitiatives ? (
          <p style={{ color: "var(--text-secondary)", fontSize: "1.05rem", marginTop: "12px", fontWeight: 300, lineHeight: 1.6, maxWidth: 640 }}>
            {data.whatMattersNow}
          </p>
        ) : data?.coachBriefing?.insight && data.hasInitiatives ? (
          <p style={{ color: "var(--text-secondary)", fontSize: "1.05rem", marginTop: "12px", fontWeight: 300, lineHeight: 1.6, maxWidth: 640 }}>
            {data.coachBriefing.insight}
          </p>
        ) : null}
      </header>

      <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
        <AiSuggestionsBanner />

        {data?.currentFocus && (
          <section
            className="glass-card"
            style={{
              padding: "20px 24px",
              borderLeft: "3px solid var(--accent-primary)",
            }}
          >
            <p style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "6px" }}>
              What you&apos;re trying to achieve
            </p>
            <p style={{ fontSize: "1.05rem", fontWeight: 500, marginBottom: "10px" }}>{data.currentFocus.title}</p>
            {data.currentFocus.coachInsight && (
              <p style={{ fontSize: "0.92rem", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "10px" }}>
                {data.currentFocus.coachInsight}
              </p>
            )}
            <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", margin: 0 }}>
              {data.currentFocus.until ? `Deadline ${data.currentFocus.until}` : "No deadline set"}
              {" · "}
              <span style={{ color: data.currentFocus.health.health === "at_risk" ? "#f59e0b" : "var(--accent-primary)" }}>
                {data.currentFocus.health.label}
              </span>
              {" — "}
              {data.currentFocus.health.reason}
            </p>
          </section>
        )}

        {data?.coachBriefing && data.hasInitiatives && (
          <section className="glass-card" style={{ padding: "clamp(20px, 4vw, 28px)" }}>
            <h2 style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", marginBottom: 16 }}>
              What MenAI understands
            </h2>
            {data.coachBriefing.understands.length > 0 ? (
              <ul style={{ margin: "0 0 16px", paddingLeft: 20, fontSize: "0.92rem", color: "var(--text-primary)", lineHeight: 1.7 }}>
                {data.coachBriefing.understands.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <p style={{ fontSize: "0.9rem", color: "var(--text-muted)", marginBottom: 16 }}>Initiative created — baseline details still missing.</p>
            )}
            {data.coachBriefing.stillNeeds.length > 0 && (
              <>
                <h3 style={{ fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: 8 }}>
                  Still needs to know
                </h3>
                <ul style={{ margin: "0 0 16px", paddingLeft: 20, fontSize: "0.9rem", color: "#f59e0b", lineHeight: 1.6 }}>
                  {data.coachBriefing.stillNeeds.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </>
            )}
            {data.coachBriefing.recentActivity && (
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: 0, lineHeight: 1.6, borderTop: "1px solid var(--border-color)", paddingTop: 14 }}>
                <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Recently: </span>
                {data.coachBriefing.recentActivity}
              </p>
            )}
          </section>
        )}

        <section className="glass-card" style={{ padding: "clamp(24px, 4vw, 36px)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "8px" }}>
            <h2 style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-secondary)", fontWeight: 500, display: "flex", alignItems: "center", gap: "8px" }}>
              <Calendar size={16} />
              Today&apos;s focus
            </h2>
            <Link href="/dashboard/plans" style={{ fontSize: "0.85rem", color: "var(--accent-primary)", textDecoration: "none" }}>
              {data?.hasPlan ? "Open plan →" : "Generate plan →"}
            </Link>
          </div>

          {isLoading ? (
            <div className="skeleton shimmer" style={{ height: 100, borderRadius: 8 }} />
          ) : data?.focusTasks.length ? (
            <ol style={{ margin: 0, paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
              {data.focusTasks.map((task, idx) => (
                <li key={task.id} style={{ fontSize: "1rem", color: "var(--text-primary)", fontWeight: 300, lineHeight: 1.6 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                    <button
                      type="button"
                      onClick={() => toggleTask.mutate({ id: task.id, status: task.status })}
                      aria-label={`Mark task ${idx + 1} complete`}
                      style={{
                        marginTop: 4,
                        background: "none",
                        border: "1.5px solid var(--border-color)",
                        width: 18,
                        height: 18,
                        borderRadius: "50%",
                        cursor: "pointer",
                        flexShrink: 0,
                      }}
                    />
                    <span>{task.title}</span>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <div style={{ color: "var(--text-muted)", lineHeight: 1.7, fontWeight: 300 }}>
              {showEmptySetup ? (
                <>
                  <p>Add one specific initiative with a deadline — e.g. lose 5 kg by August, pass UPSC prelims, or launch your MVP.</p>
                  <Link href="/dashboard/goals" className="btn-primary" style={{ display: "inline-flex", marginTop: 16, textDecoration: "none", padding: "10px 20px", fontSize: "0.9rem" }}>
                    Add your first initiative
                  </Link>
                </>
              ) : isNew ? (
                <p>Start by telling MenAI what you&apos;re actively working on — then open Today&apos;s Plan.</p>
              ) : data?.hasInitiatives ? (
                <p>No tasks for today yet. Generate your daily plan from your active initiatives.</p>
              ) : (
                <p>Add an active initiative (with a deadline) — daily tasks come from initiatives, not abstract goals.</p>
              )}
              {!showEmptySetup && (
              <Link href="/dashboard/plans" className="btn-primary" style={{ display: "inline-flex", marginTop: 16, textDecoration: "none", padding: "10px 20px", fontSize: "0.9rem" }}>
                Go to Today&apos;s Plan
              </Link>
              )}
            </div>
          )}

          {data?.topMomentumInitiative && data.focusTasks.length > 0 && data.hasInitiatives && (
            <p style={{ marginTop: 20, fontSize: "0.88rem", color: "var(--text-muted)" }}>
              {data.coachBriefing?.mattersToday || (
                <>Today&apos;s priority: <strong style={{ color: "var(--accent-primary)", fontWeight: 500 }}>{data.focusTasks[0]?.title}</strong></>
              )}
            </p>
          )}
        </section>

        {(isLoading || (data?.initiatives.length ?? 0) > 0) && (
          <section className="glass-card" style={{ padding: "clamp(24px, 4vw, 36px)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "8px" }}>
              <h2 style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-secondary)", fontWeight: 500, display: "flex", alignItems: "center", gap: "8px" }}>
                <Zap size={16} />
                Active initiatives
              </h2>
              <Link href="/dashboard/goals" style={{ fontSize: "0.85rem", color: "var(--accent-primary)", textDecoration: "none" }}>
                Manage →
              </Link>
            </div>
            {isLoading ? (
              <div className="skeleton shimmer" style={{ height: 60, borderRadius: 8 }} />
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                {data?.initiatives.map((init) => (
                  <span
                    key={init.id}
                    style={{
                      padding: "8px 14px",
                      borderRadius: "var(--radius-full)",
                      background: "var(--bg-glass)",
                      border: "1px solid var(--border-color)",
                      fontSize: "0.9rem",
                      color: "var(--text-primary)",
                    }}
                  >
                    {init.title}
                  </span>
                ))}
              </div>
            )}
          </section>
        )}

        {!isLoading && !data?.hasInitiatives && (
          <section className="glass-card" style={{ padding: "clamp(24px, 4vw, 36px)", borderLeft: "3px solid var(--accent-primary)" }}>
            <h2 style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--accent-primary)", marginBottom: 10 }}>
              Set up execution
            </h2>
            <p style={{ color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 16, fontWeight: 300 }}>
              Long-term goals are direction. <strong>Initiatives</strong> are what you execute this month — AI SaaS, job search, fat loss. Daily plans come from initiatives.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <Link href="/dashboard/goals" className="btn-primary" style={{ textDecoration: "none", padding: "10px 18px", fontSize: "0.88rem", display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Target size={14} /> Add initiative
              </Link>
              <Link href="/dashboard/chat" className="btn-secondary" style={{ textDecoration: "none", padding: "10px 18px", fontSize: "0.88rem", display: "inline-flex", alignItems: "center", gap: 6 }}>
                <MessageSquare size={14} /> Tell MenAI what you&apos;re building
              </Link>
            </div>
          </section>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, paddingTop: 8 }}>
          <Link
            href="/dashboard/timeline"
            style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--text-secondary)", textDecoration: "none", fontSize: "0.9rem" }}
          >
            <History size={14} /> Memory timeline
          </Link>
          <Link
            href="/dashboard/chat"
            style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--text-secondary)", textDecoration: "none", fontSize: "0.9rem" }}
          >
            Resume conversation <ArrowRight size={14} />
          </Link>
          <Link href="/dashboard/reports" style={{ color: "var(--text-muted)", textDecoration: "none", fontSize: "0.88rem" }}>
            Weekly review →
          </Link>
        </div>
      </div>
    </div>
  );
}
