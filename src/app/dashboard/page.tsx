"use client";

import { createClient } from "@/lib/supabase/client";
import { useAppStore } from "@/lib/store";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Compass,
  Target,
  Eye,
  ShieldCheck,
  ArrowRight,
  Sparkles,
  BookOpen,
  TrendingUp
} from "lucide-react";
import { generateDashboardIntelligence } from "@/lib/dashboard/synthesis";

interface Goal {
  id: string;
  title: string;
  status: string;
}

interface TaskItem {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
}

interface Commitment {
  id: string;
  description: string;
  status: string;
  consistency_score?: number;
}

export default function DashboardOverview() {
  const { user } = useAppStore();
  const supabase = createClient();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);

  // Check onboarding status — use onboarding_progress as single source of truth
  useEffect(() => {
    const checkOnboarding = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        router.replace("/login");
        return;
      }

      // Check the same table the onboarding page checks (onboarding_progress)
      // to avoid desync between profiles.onboarding_completed and
      // onboarding_progress.completed_at which caused redirect loops.
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

  const { data: intelligence, isLoading: intelligenceLoading } = useQuery({
    queryKey: ["dashboard-intelligence"],
    queryFn: async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return null;

      return await generateDashboardIntelligence(authUser.id);
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes
  });

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-core"],
    queryFn: async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return null;

      const [
        goalsRes,
        tasksRes,
        commitmentsRes,
        reflectionsRes,
      ] = await Promise.allSettled([
        supabase.from("goals").select("id, title, status").eq("user_id", authUser.id).eq("status", "active"),
        supabase.from("tasks").select("id, title, status, due_date").eq("user_id", authUser.id).in("status", ["pending", "in_progress"]),
        supabase.from("commitments").select("id, description, status, consistency_score").eq("user_id", authUser.id).eq("status", "active"),
        supabase.from("memories").select("content").eq("user_id", authUser.id).eq("memory_type", "reflection").order("created_at", { ascending: false }).limit(1),
      ]);

      const goals = goalsRes.status === "fulfilled" ? (goalsRes.value.data || []) as Goal[] : [];
      const tasks = tasksRes.status === "fulfilled" ? (tasksRes.value.data || []) as TaskItem[] : [];
      const commitments = commitmentsRes.status === "fulfilled" ? (commitmentsRes.value.data || []) as Commitment[] : [];
        
      const reflection = reflectionsRes.status === "fulfilled" && reflectionsRes.value.data && reflectionsRes.value.data.length > 0
        ? reflectionsRes.value.data[0].content
        : null;

      return {
        goals,
        tasks,
        commitments,
        reflection,
      };
    },
    staleTime: 60_000,
  });

  const toggleTask = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const newStatus = status === "completed" ? "pending" : "completed";
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: newStatus }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-core"] });
    },
  });

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Morning";
    if (hour < 18) return "Afternoon";
    return "Evening";
  };

  const tasks = data?.tasks || [];
  const commitments = data?.commitments || [];
  const reflection = data?.reflection;
  
  const currentDirection = intelligence?.currentDirection || "Synthesizing current direction...";
  const observation = intelligence?.aiObservation;
  const activeFocus = intelligence?.activeFocus || [];
  const nextSteps = intelligence?.suggestedNextSteps || [];
  const momentumTrend = intelligence?.momentumTrend;

  if (checkingOnboarding) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="skeleton shimmer" style={{ width: "200px", height: "40px", borderRadius: "8px" }} />
      </div>
    );
  }

  return (
    <div style={{ padding: "64px 48px", maxWidth: "1100px", margin: "0 auto", width: "100%" }}>
      {/* ===== HEADER ===== */}
      <div className="animate-fade-in" style={{ marginBottom: "72px" }}>
        <h1 suppressHydrationWarning style={{ fontSize: "2.5rem", fontWeight: 400, letterSpacing: "-0.03em", lineHeight: 1.2 }}>
          {greeting()}, {user?.full_name?.split(" ")[0] || "there"}.
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "1.1rem", marginTop: "12px", fontWeight: 300, lineHeight: 1.6 }}>
          Here is your current trajectory.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "40px" }}>
        
        {/* ROW 1: Direction & Observation */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "28px" }}>
          
          <section className="glass-card" style={{ padding: "40px", transition: "all 0.3s ease" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
              <Compass size={20} style={{ color: "var(--text-muted)" }} />
              <h2 style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-secondary)", fontWeight: 500 }}>
                Current Direction
              </h2>
            </div>
            {intelligenceLoading ? (
              <div className="skeleton shimmer" style={{ height: "70px", width: "100%", borderRadius: "8px" }} />
            ) : (
              <p style={{ fontSize: "1.05rem", color: "var(--text-primary)", lineHeight: 1.8, fontWeight: 300 }}>
                {currentDirection}
              </p>
            )}
          </section>

          <section className="glass-card" style={{ padding: "40px", transition: "all 0.3s ease" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
              <Eye size={20} style={{ color: "var(--accent-secondary)" }} />
              <h2 style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--accent-secondary)", fontWeight: 500 }}>
                AI Observation
              </h2>
            </div>
            {intelligenceLoading ? (
              <div className="skeleton shimmer" style={{ height: "70px", width: "100%", borderRadius: "8px" }} />
            ) : observation ? (
              <p style={{ fontSize: "1rem", color: "var(--text-primary)", lineHeight: 1.8, fontStyle: "italic", fontWeight: 300 }}>
                {observation}
              </p>
            ) : (
              <p style={{ fontSize: "0.95rem", color: "var(--text-muted)", lineHeight: 1.8, fontWeight: 300 }}>
                No stable patterns detected yet.
              </p>
            )}
          </section>
        </div>

        {/* ROW 2: Focus & Commitments */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "28px" }}>
          
          <section className="glass-card" style={{ padding: "40px", transition: "all 0.3s ease" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "28px" }}>
              <Target size={20} style={{ color: "var(--text-muted)" }} />
              <h2 style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-secondary)", fontWeight: 500 }}>
                Active Focus
              </h2>
            </div>
            
            {intelligenceLoading ? (
              <div className="skeleton shimmer" style={{ height: "120px", width: "100%", borderRadius: "8px" }} />
            ) : activeFocus.length > 0 || tasks.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                {(activeFocus.length > 0 ? activeFocus : tasks.slice(0, 4).map(t => t.title)).map((item, idx) => {
                  const task = tasks.find(t => t.title === item);
                  return (
                    <div key={task?.id || idx} style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
                      {task ? (
                        <button
                          onClick={() => toggleTask.mutate({ id: task.id, status: task.status })}
                          style={{ 
                            marginTop: "4px", 
                            background: "none", 
                            border: "1.5px solid var(--border-color)", 
                            width: "18px", 
                            height: "18px", 
                            borderRadius: "50%", 
                            cursor: "pointer",
                            transition: "all 0.25s ease"
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = "var(--accent-primary)";
                            e.currentTarget.style.transform = "scale(1.1)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = "var(--border-color)";
                            e.currentTarget.style.transform = "scale(1)";
                          }}
                        />
                      ) : (
                        <div style={{ marginTop: "4px", width: "4px", height: "18px", background: "var(--border-color)", borderRadius: "2px" }} />
                      )}
                      <span style={{ fontSize: "0.95rem", color: "var(--text-primary)", fontWeight: 300, lineHeight: 1.7 }}>
                        {item}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ fontSize: "0.95rem", color: "var(--text-muted)", fontWeight: 300, lineHeight: 1.8 }}>
                No active focus tracked.
              </p>
            )}
          </section>

          <section className="glass-card" style={{ padding: "40px", transition: "all 0.3s ease" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "28px" }}>
              <ShieldCheck size={20} style={{ color: "var(--text-muted)" }} />
              <h2 style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-secondary)", fontWeight: 500 }}>
                Commitments
              </h2>
            </div>

            {intelligenceLoading ? (
              <div className="skeleton shimmer" style={{ height: "120px", width: "100%", borderRadius: "8px" }} />
            ) : commitments.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                {commitments.map(c => (
                  <div key={c.id} style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
                    <div 
                      style={{ 
                        width: "4px", 
                        height: "18px", 
                        background: c.consistency_score && c.consistency_score >= 70 
                          ? "var(--accent-primary)" 
                          : "var(--border-color)", 
                        borderRadius: "2px", 
                        marginTop: "4px",
                        transition: "background 0.3s ease"
                      }} 
                    />
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: "0.95rem", color: "var(--text-primary)", fontWeight: 300, lineHeight: 1.7 }}>
                        {c.description}
                      </span>
                      {c.consistency_score !== undefined && c.consistency_score > 0 && (
                        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "6px", lineHeight: 1.5 }}>
                          {Math.round(c.consistency_score)}% follow-through
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: "0.95rem", color: "var(--text-muted)", fontWeight: 300, lineHeight: 1.8 }}>
                No commitments detected.
              </p>
            )}
          </section>
        </div>

        {/* ROW 3: Momentum & Reflections */}
        {momentumTrend && (
          <section className="glass-card" style={{ padding: "28px 40px", transition: "all 0.3s ease" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
              <TrendingUp size={20} style={{ color: "var(--accent-primary)" }} />
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", marginBottom: "6px", fontWeight: 500 }}>
                  Momentum
                </h2>
                <p style={{ fontSize: "0.95rem", color: "var(--text-primary)", fontWeight: 300, lineHeight: 1.7 }}>
                  {momentumTrend}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* ROW 4: Reflections & Next Steps */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "28px" }}>
          
          <section className="glass-card" style={{ padding: "40px", transition: "all 0.3s ease" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
              <BookOpen size={20} style={{ color: "var(--text-muted)" }} />
              <h2 style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-secondary)", fontWeight: 500 }}>
                Reflections
              </h2>
            </div>
            {intelligenceLoading ? (
              <div className="skeleton shimmer" style={{ height: "70px", width: "100%", borderRadius: "8px" }} />
            ) : reflection ? (
              <p style={{ fontSize: "0.95rem", color: "var(--text-primary)", lineHeight: 1.8, fontWeight: 300 }}>
                {reflection}
              </p>
            ) : (
              <p style={{ fontSize: "0.95rem", color: "var(--text-muted)", lineHeight: 1.8, fontWeight: 300 }}>
                Insufficient data for reflection synthesis.
              </p>
            )}
          </section>

          <section className="glass-card" style={{ padding: "40px", display: "flex", flexDirection: "column", transition: "all 0.3s ease" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
              <Sparkles size={20} style={{ color: "var(--accent-primary)" }} />
              <h2 style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--accent-primary)", fontWeight: 500 }}>
                Suggested Next Steps
              </h2>
            </div>
            {intelligenceLoading ? (
              <div className="skeleton shimmer" style={{ height: "100px", width: "100%", borderRadius: "8px" }} />
            ) : (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: "14px", flex: 1 }}>
                  {nextSteps.map((step, idx) => (
                    <div key={idx} style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                      <span style={{ fontSize: "0.85rem", color: "var(--accent-primary)", fontWeight: 500, marginTop: "2px" }}>
                        {idx + 1}.
                      </span>
                      <span style={{ fontSize: "0.95rem", color: "var(--text-secondary)", lineHeight: 1.8, fontWeight: 300 }}>
                        {step}
                      </span>
                    </div>
                  ))}
                </div>
                <Link 
                  href="/dashboard/chat" 
                  style={{ 
                    marginTop: "24px", 
                    display: "inline-flex", 
                    alignItems: "center", 
                    gap: "8px", 
                    color: "var(--text-primary)", 
                    textDecoration: "none", 
                    fontSize: "0.9rem",
                    opacity: 0.8,
                    transition: "all 0.25s ease"
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.opacity = "1";
                    e.currentTarget.style.gap = "12px";
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.opacity = "0.8";
                    e.currentTarget.style.gap = "8px";
                  }}
                >
                  Resume conversation <ArrowRight size={14} />
                </Link>
              </>
            )}
          </section>

        </div>
      </div>
    </div>
  );
}
