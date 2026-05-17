"use client";

import { createClient } from "@/lib/supabase/client";
import { useAppStore } from "@/lib/store";
import { getMoodEmoji, getMoodColor, formatRelative } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  MessageCircleHeart,
  Activity,
  BookHeart,
  Dumbbell,
  Moon,
  TrendingUp,
  Calendar,
  Heart,
  Sparkles,
  ArrowRight,
} from "lucide-react";

interface MoodEntry {
  id: string;
  mood_score: number;
  mood_label: string;
  created_at: string;
}

export default function DashboardOverview() {
  const { user } = useAppStore();
  const supabase = createClient();

  const { data, isLoading: loading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return null;

      const [convRes, moodRes, journalRes] = await Promise.all([
        supabase.from("conversations").select("id", { count: "exact" }).eq("user_id", authUser.id),
        supabase.from("mood_entries").select("*").eq("user_id", authUser.id).order("created_at", { ascending: false }).limit(7),
        supabase.from("journal_entries").select("id", { count: "exact" }).eq("user_id", authUser.id),
      ]);

      return {
        stats: {
          totalChats: convRes.count || 0,
          moodEntries: moodRes.data?.length || 0,
          journalEntries: journalRes.count || 0,
          recentMood: moodRes.data?.[0]?.mood_score || null,
          streak: Math.min(moodRes.data?.length || 0, 7),
        },
        recentMoods: (moodRes.data || []) as MoodEntry[],
      };
    },
    staleTime: 60_000,
  });

  const stats = data?.stats || { totalChats: 0, moodEntries: 0, journalEntries: 0, recentMood: null, streak: 0 };
  const recentMoods = data?.recentMoods || [];

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const quickActions = [
    { href: "/dashboard/chat", icon: MessageCircleHeart, label: "Talk to AI", desc: "Start a supportive conversation", gradient: "linear-gradient(135deg, #7c5cfc, #5ce0d8)" },
    { href: "/dashboard/mood", icon: Activity, label: "Log Mood", desc: "Track how you're feeling", gradient: "linear-gradient(135deg, #5ce0d8, #5c8cfc)" },
    { href: "/dashboard/journal", icon: BookHeart, label: "Write Journal", desc: "Express your thoughts", gradient: "linear-gradient(135deg, #fc5c9c, #fcb05c)" },
    { href: "/dashboard/meditation", icon: Moon, label: "Meditate", desc: "Find your calm", gradient: "linear-gradient(135deg, #5c8cfc, #7c5cfc)" },
  ];

  return (
    <div style={{ padding: "32px", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Greeting */}
      <div className="animate-fade-in" style={{ marginBottom: "40px" }}>
        <h1 style={{ fontSize: "2rem", fontWeight: 700, marginBottom: "8px" }}>
          {greeting()}, <span className="gradient-text">{user?.full_name?.split(" ")[0] || "there"}</span> 👋
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "1.05rem" }}>
          How are you feeling today? Your wellness companion is here for you.
        </p>
      </div>

      {/* Quick Actions */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "16px",
          marginBottom: "40px",
        }}
      >
        {quickActions.map((action, i) => (
          <Link
            key={action.href}
            href={action.href}
            className="glass-card animate-slide-up"
            style={{
              padding: "24px",
              textDecoration: "none",
              animationDelay: `${i * 0.1}s`,
              opacity: 0,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "var(--radius-md)",
                background: action.gradient,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "16px",
              }}
            >
              <action.icon size={22} color="white" />
            </div>
            <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "4px", color: "var(--text-primary)" }}>
              {action.label}
            </h3>
            <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              {action.desc}
            </p>
          </Link>
        ))}
      </div>

      {/* Stats Row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "16px",
          marginBottom: "40px",
        }}
      >
        {[
          { icon: MessageCircleHeart, label: "Conversations", value: stats.totalChats, color: "var(--accent-primary)" },
          { icon: Activity, label: "Mood Entries", value: stats.moodEntries, color: "var(--accent-secondary)" },
          { icon: BookHeart, label: "Journal Entries", value: stats.journalEntries, color: "var(--accent-tertiary)" },
          { icon: Calendar, label: "Day Streak", value: stats.streak, color: "var(--accent-warm)" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="glass-card"
            style={{ padding: "20px", cursor: "default" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
              <stat.icon size={18} style={{ color: stat.color }} />
              <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>{stat.label}</span>
            </div>
            <div style={{ fontSize: "1.8rem", fontWeight: 700 }}>
              {loading ? (
                <div className="skeleton" style={{ width: "60px", height: "32px" }} />
              ) : (
                stat.value
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Recent Mood & Insight */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
        {/* Mood Overview */}
        <div className="glass-card" style={{ padding: "28px", cursor: "default" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
            <h3 style={{ fontSize: "1.1rem", fontWeight: 600 }}>Recent Mood</h3>
            <Link href="/dashboard/mood" style={{ color: "var(--accent-primary)", fontSize: "0.85rem", textDecoration: "none", display: "flex", alignItems: "center", gap: "4px" }}>
              View All <ArrowRight size={14} />
            </Link>
          </div>
          {recentMoods.length > 0 ? (
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              {recentMoods.slice(0, 7).map((mood) => (
                <div key={mood.id} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "1.5rem", marginBottom: "4px" }}>
                    {getMoodEmoji(mood.mood_score)}
                  </div>
                  <div
                    style={{
                      fontSize: "0.7rem",
                      color: "var(--text-muted)",
                    }}
                  >
                    {formatRelative(mood.created_at)}
                  </div>
                  <div
                    style={{
                      width: "100%",
                      height: "4px",
                      borderRadius: "2px",
                      background: getMoodColor(mood.mood_score),
                      marginTop: "4px",
                      opacity: 0.6,
                    }}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "20px", color: "var(--text-muted)" }}>
              <Activity size={32} style={{ marginBottom: "8px", opacity: 0.3 }} />
              <p style={{ fontSize: "0.9rem" }}>No mood entries yet. Start tracking!</p>
            </div>
          )}
        </div>

        {/* Wellness Tip */}
        <div
          className="glass-card"
          style={{
            padding: "28px",
            cursor: "default",
            background: "linear-gradient(135deg, rgba(124, 92, 252, 0.08), rgba(92, 224, 216, 0.05))",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
            <Sparkles size={18} style={{ color: "var(--accent-primary)" }} />
            <h3 style={{ fontSize: "1.1rem", fontWeight: 600 }}>Daily Wellness Tip</h3>
          </div>
          <p style={{ color: "var(--text-secondary)", lineHeight: 1.7, fontSize: "0.95rem", marginBottom: "16px" }}>
            &ldquo;Take a moment to notice 5 things you can see around you right now.
            This simple grounding exercise can help bring you back to the present
            moment when your mind feels overwhelmed.&rdquo;
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Heart size={14} style={{ color: "var(--accent-tertiary)" }} />
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              5-4-3-2-1 Grounding Technique
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
