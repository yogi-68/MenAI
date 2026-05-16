"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Moon, Play, Pause, RotateCcw, Timer, Heart, Wind } from "lucide-react";

interface MeditationSession {
  id: string;
  title: string;
  description: string;
  category: string;
  duration_seconds: number;
  guide_text: string;
}

export default function MeditationPage() {
  const [sessions, setSessions] = useState<MeditationSession[]>([]);
  const [active, setActive] = useState<MeditationSession | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [breathPhase, setBreathPhase] = useState<"inhale" | "hold" | "exhale">("inhale");
  const [showBreathing, setShowBreathing] = useState(false);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const breathRef = useRef<NodeJS.Timeout | null>(null);
  const supabase = createClient();

  useEffect(() => {
    const fetchSessions = async () => {
      const { data } = await supabase
        .from("meditation_sessions")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: true });
      setSessions(data || []);
      setLoading(false);
    };
    fetchSessions();
  }, []);

  useEffect(() => {
    if (isPlaying && active) {
      timerRef.current = setInterval(() => {
        setTimeElapsed((prev) => {
          if (prev >= active.duration_seconds) {
            setIsPlaying(false);
            clearInterval(timerRef.current!);
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, active]);

  // Breathing animation cycle
  useEffect(() => {
    if (showBreathing) {
      const cycle = () => {
        setBreathPhase("inhale");
        breathRef.current = setTimeout(() => {
          setBreathPhase("hold");
          breathRef.current = setTimeout(() => {
            setBreathPhase("exhale");
            breathRef.current = setTimeout(cycle, 6000);
          }, 4000);
        }, 4000);
      };
      cycle();
    }
    return () => {
      if (breathRef.current) clearTimeout(breathRef.current);
    };
  }, [showBreathing]);

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const getCategoryIcon = (c: string) => {
    const icons: Record<string, string> = {
      "Morning": "🌅",
      "Anxiety": "🌊",
      "Sleep": "🌙",
      "Self-Care": "💗",
      "Breathing": "🌬️",
    };
    return icons[c] || "🧘";
  };

  const getCategoryGradient = (c: string) => {
    const gradients: Record<string, string> = {
      "Morning": "linear-gradient(135deg, #fcb05c, #fc5c9c)",
      "Anxiety": "linear-gradient(135deg, #5c8cfc, #5ce0d8)",
      "Sleep": "linear-gradient(135deg, #7c5cfc, #5c8cfc)",
      "Self-Care": "linear-gradient(135deg, #fc5c9c, #fcb05c)",
      "Breathing": "linear-gradient(135deg, #5ce0d8, #7c5cfc)",
    };
    return gradients[c] || "var(--gradient-primary)";
  };

  if (active) {
    const progress = (timeElapsed / active.duration_seconds) * 100;
    return (
      <div style={{ padding: "32px", maxWidth: "600px", margin: "0 auto", textAlign: "center" }}>
        <button
          onClick={() => { setActive(null); setIsPlaying(false); setTimeElapsed(0); }}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-secondary)",
            cursor: "pointer",
            fontSize: "0.9rem",
            marginBottom: "24px",
          }}
        >
          ← Back to sessions
        </button>

        <div className="glass-card" style={{ padding: "48px 32px", cursor: "default" }}>
          <span style={{ fontSize: "3rem" }}>{getCategoryIcon(active.category)}</span>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginTop: "16px", marginBottom: "4px" }}>
            {active.title}
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "32px" }}>
            {active.category} · {formatTimer(active.duration_seconds)}
          </p>

          {/* Timer Circle */}
          <div
            style={{
              width: 200,
              height: 200,
              borderRadius: "50%",
              border: "3px solid var(--border-color)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "column",
              margin: "0 auto 32px",
              position: "relative",
              background: `conic-gradient(var(--accent-primary) ${progress}%, transparent ${progress}%)`,
            }}
          >
            <div
              style={{
                width: 180,
                height: 180,
                borderRadius: "50%",
                background: "var(--bg-secondary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "column",
              }}
            >
              <div style={{ fontSize: "2.5rem", fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                {formatTimer(timeElapsed)}
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                / {formatTimer(active.duration_seconds)}
              </div>
            </div>
          </div>

          {/* Controls */}
          <div style={{ display: "flex", gap: "16px", justifyContent: "center", marginBottom: "32px" }}>
            <button
              onClick={() => setTimeElapsed(0)}
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "var(--bg-glass)",
                border: "1px solid var(--border-color)",
                color: "var(--text-secondary)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <RotateCcw size={20} />
            </button>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "var(--gradient-primary)",
                border: "none",
                color: "white",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 20px rgba(124, 92, 252, 0.4)",
              }}
            >
              {isPlaying ? <Pause size={28} /> : <Play size={28} style={{ marginLeft: "3px" }} />}
            </button>
          </div>

          {/* Guide Text */}
          <div
            style={{
              padding: "20px",
              borderRadius: "var(--radius-md)",
              background: "rgba(124, 92, 252, 0.05)",
              border: "1px solid rgba(124, 92, 252, 0.1)",
              textAlign: "left",
              maxHeight: "200px",
              overflowY: "auto",
            }}
          >
            <p style={{ color: "var(--text-secondary)", lineHeight: 1.8, fontSize: "0.9rem", fontStyle: "italic" }}>
              {active.guide_text}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "32px", maxWidth: "900px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{ fontSize: "1.8rem", fontWeight: 700, marginBottom: "4px" }}>
          <span className="gradient-text">Meditation</span>
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>
          Find your calm with guided sessions and breathing exercises
        </p>
      </div>

      {/* Quick Breathing Exercise */}
      <div
        className="glass-card"
        style={{
          padding: "32px",
          marginBottom: "32px",
          cursor: "pointer",
          textAlign: "center",
          background: "linear-gradient(135deg, rgba(92, 224, 216, 0.05), rgba(124, 92, 252, 0.05))",
        }}
        onClick={() => setShowBreathing(!showBreathing)}
      >
        <Wind size={24} style={{ color: "var(--accent-secondary)", marginBottom: "12px" }} />
        <h3 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "4px" }}>Quick Breathing</h3>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: "20px" }}>
          Tap to start a simple breathing exercise
        </p>

        {showBreathing && (
          <div style={{ animation: "fadeIn 0.3s ease-out" }}>
            <div
              className="animate-breathe"
              style={{
                width: 120,
                height: 120,
                borderRadius: "50%",
                background: "var(--gradient-calm)",
                margin: "0 auto 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span style={{ fontSize: "1.2rem", fontWeight: 700, color: "white" }}>
                {breathPhase === "inhale" ? "Breathe In" : breathPhase === "hold" ? "Hold" : "Breathe Out"}
              </span>
            </div>
            <p style={{ color: "var(--accent-secondary)", fontSize: "0.9rem" }}>
              {breathPhase === "inhale" ? "4 seconds" : breathPhase === "hold" ? "4 seconds" : "6 seconds"}
            </p>
          </div>
        )}
      </div>

      {/* Sessions Grid */}
      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
          {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: "160px" }} />)}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
          {sessions.map((session) => (
            <div
              key={session.id}
              className="glass-card"
              style={{ padding: "24px", cursor: "pointer" }}
              onClick={() => setActive(session)}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "12px" }}>
                <span style={{ fontSize: "2rem" }}>{getCategoryIcon(session.category)}</span>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    fontSize: "0.75rem",
                    color: "var(--text-muted)",
                    padding: "4px 10px",
                    borderRadius: "var(--radius-full)",
                    background: "var(--bg-glass)",
                  }}
                >
                  <Timer size={12} />
                  {formatTimer(session.duration_seconds)}
                </div>
              </div>
              <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "6px" }}>{session.title}</h3>
              <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                {session.description}
              </p>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  marginTop: "12px",
                  fontSize: "0.8rem",
                  color: "var(--accent-primary)",
                  fontWeight: 500,
                }}
              >
                <Play size={14} />
                Start Session
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
