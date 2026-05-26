"use client";

import { createClient } from "@/lib/supabase/client";
import { useAppStore } from "@/lib/store";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  Compass,
  Target,
  Eye,
  ShieldCheck,
  ArrowRight,
  Sparkles,
  BookOpen
} from "lucide-react";

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
}

export default function DashboardOverview() {
  const { user } = useAppStore();
  const supabase = createClient();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-core"],
    queryFn: async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return null;

      const [
        goalsRes,
        tasksRes,
        commitmentsRes,
        insightsRes,
        reflectionsRes,
      ] = await Promise.allSettled([
        supabase.from("goals").select("id, title, status").eq("user_id", authUser.id).eq("status", "active"),
        supabase.from("tasks").select("id, title, status, due_date").eq("user_id", authUser.id).in("status", ["pending", "in_progress"]),
        supabase.from("commitments").select("id, description, status").eq("user_id", authUser.id).eq("status", "active"),
        supabase.from("memories").select("content").eq("user_id", authUser.id).eq("memory_type", "observation").order("created_at", { ascending: false }).limit(1),
        supabase.from("memories").select("content").eq("user_id", authUser.id).eq("memory_type", "reflection").order("created_at", { ascending: false }).limit(1),
      ]);

      const goals = goalsRes.status === "fulfilled" ? (goalsRes.value.data || []) as Goal[] : [];
      const tasks = tasksRes.status === "fulfilled" ? (tasksRes.value.data || []) as TaskItem[] : [];
      const commitments = commitmentsRes.status === "fulfilled" ? (commitmentsRes.value.data || []) as Commitment[] : [];
      
      const observation = insightsRes.status === "fulfilled" && insightsRes.value.data && insightsRes.value.data.length > 0 
        ? insightsRes.value.data[0].content 
        : null;
        
      const reflection = reflectionsRes.status === "fulfilled" && reflectionsRes.value.data && reflectionsRes.value.data.length > 0
        ? reflectionsRes.value.data[0].content
        : null;

      return {
        goals,
        tasks,
        commitments,
        observation,
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

  const generateCurrentDirection = () => {
    if (isLoading) return "Synthesizing current direction...";
    const goals = data?.goals || [];
    if (goals.length === 0) {
      return "Your trajectory emerges through conversation. Share what you're working toward, and MenAI will help you maintain focus.";
    }
    return `You are currently focusing on ${goals.map(g => g.title.toLowerCase()).join(", ")}.`;
  };

  const tasks = data?.tasks || [];
  const commitments = data?.commitments || [];
  const observation = data?.observation;
  const reflection = data?.reflection;

  return (
    <div style={{ padding: "64px 48px", maxWidth: "1000px", margin: "0 auto", width: "100%" }}>
      {/* ===== HEADER ===== */}
      <div className="animate-fade-in" style={{ marginBottom: "64px" }}>
        <h1 suppressHydrationWarning style={{ fontSize: "2.5rem", fontWeight: 400, letterSpacing: "-0.03em" }}>
          {greeting()}, {user?.full_name?.split(" ")[0] || "there"}.
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "1.1rem", marginTop: "8px", fontWeight: 300 }}>
          Here is your current trajectory.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
        
        {/* ROW 1: Direction & Observation */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "24px" }}>
          
          <section className="glass-card" style={{ padding: "32px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
              <Compass size={18} style={{ color: "var(--text-muted)" }} />
              <h2 style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-secondary)" }}>
                Current Direction
              </h2>
            </div>
            <p style={{ fontSize: "1.05rem", color: "var(--text-primary)", lineHeight: 1.6, fontWeight: 300 }}>
              {generateCurrentDirection()}
            </p>
          </section>

          <section className="glass-card" style={{ padding: "32px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
              <Eye size={18} style={{ color: "var(--accent-secondary)" }} />
              <h2 style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--accent-secondary)" }}>
                AI Observation
              </h2>
            </div>
            {isLoading ? (
              <div className="skeleton" style={{ height: "60px", width: "100%" }} />
            ) : observation ? (
              <p style={{ fontSize: "1rem", color: "var(--text-primary)", lineHeight: 1.6, fontStyle: "italic", fontWeight: 300 }}>
                "{observation}"
              </p>
            ) : (
              <p style={{ fontSize: "0.95rem", color: "var(--text-muted)", lineHeight: 1.6, fontWeight: 300 }}>
                Patterns emerge through sustained interaction. Keep engaging, and insights will crystallize here.
              </p>
            )}
          </section>
        </div>

        {/* ROW 2: Focus & Commitments */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "24px" }}>
          
          <section className="glass-card" style={{ padding: "32px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "24px" }}>
              <Target size={18} style={{ color: "var(--text-muted)" }} />
              <h2 style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-secondary)" }}>
                Active Focus
              </h2>
            </div>
            
            {isLoading ? (
              <div className="skeleton" style={{ height: "100px", width: "100%" }} />
            ) : tasks.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {tasks.slice(0, 4).map(task => (
                  <div key={task.id} style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                    <button
                      onClick={() => toggleTask.mutate({ id: task.id, status: task.status })}
                      style={{ marginTop: "4px", background: "none", border: "1px solid var(--border-color)", width: "16px", height: "16px", borderRadius: "50%", cursor: "pointer" }}
                    />
                    <span style={{ fontSize: "0.95rem", color: "var(--text-primary)", fontWeight: 300 }}>
                      {task.title}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: "0.95rem", color: "var(--text-muted)", fontWeight: 300 }}>
                No active tasks yet. Define your focus in conversation, and execution items will appear here.
              </p>
            )}
          </section>

          <section className="glass-card" style={{ padding: "32px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "24px" }}>
              <ShieldCheck size={18} style={{ color: "var(--text-muted)" }} />
              <h2 style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-secondary)" }}>
                Commitments
              </h2>
            </div>

            {isLoading ? (
              <div className="skeleton" style={{ height: "100px", width: "100%" }} />
            ) : commitments.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {commitments.map(c => (
                  <div key={c.id} style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                    <div style={{ width: "4px", height: "16px", background: "var(--border-color)", borderRadius: "2px", marginTop: "4px" }} />
                    <span style={{ fontSize: "0.95rem", color: "var(--text-primary)", fontWeight: 300 }}>
                      {c.description}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: "0.95rem", color: "var(--text-muted)", fontWeight: 300 }}>
                No commitments tracked. Declare what you're committing to, and MenAI will hold the space for it.
              </p>
            )}
          </section>
        </div>

        {/* ROW 3: Reflections & Next Steps */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "24px" }}>
          
          <section className="glass-card" style={{ padding: "32px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
              <BookOpen size={18} style={{ color: "var(--text-muted)" }} />
              <h2 style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-secondary)" }}>
                Reflections
              </h2>
            </div>
            {isLoading ? (
              <div className="skeleton" style={{ height: "60px", width: "100%" }} />
            ) : reflection ? (
              <p style={{ fontSize: "0.95rem", color: "var(--text-primary)", lineHeight: 1.6, fontWeight: 300 }}>
                {reflection}
              </p>
            ) : (
              <p style={{ fontSize: "0.95rem", color: "var(--text-muted)", lineHeight: 1.6, fontWeight: 300 }}>
                Reflections emerge from sustained dialogue. Share your journey, and deeper synthesis will appear here.
              </p>
            )}
          </section>

          <section className="glass-card" style={{ padding: "32px", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
              <Sparkles size={18} style={{ color: "var(--accent-primary)" }} />
              <h2 style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--accent-primary)" }}>
                Suggested Next Steps
              </h2>
            </div>
            <p style={{ fontSize: "0.95rem", color: "var(--text-secondary)", lineHeight: 1.6, fontWeight: 300, flex: 1 }}>
              Continue deepening your trajectory through conversation. The system learns and adapts as you engage.
            </p>
            <Link 
              href="/dashboard/chat" 
              style={{ 
                marginTop: "16px", 
                display: "inline-flex", 
                alignItems: "center", 
                gap: "8px", 
                color: "var(--text-primary)", 
                textDecoration: "none", 
                fontSize: "0.9rem",
                opacity: 0.8,
                transition: "opacity 0.2s"
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = "1"}
              onMouseLeave={e => e.currentTarget.style.opacity = "0.8"}
            >
              Resume conversation <ArrowRight size={14} />
            </Link>
          </section>

        </div>
      </div>
    </div>
  );
}
