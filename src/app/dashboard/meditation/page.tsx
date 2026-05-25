"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Play, Pause, RotateCcw, Timer, Wind, X, Battery, Coffee } from "lucide-react";

interface RecoverySession {
  id: string;
  title: string;
  description: string;
  category: string;
  duration_seconds: number;
  guide_text: string;
}

export default function RecoveryPage() {
  const [sessions, setSessions] = useState<RecoverySession[]>([]);
  const [active, setActive] = useState<RecoverySession | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [breathPhase, setBreathPhase] = useState<"inhale" | "hold" | "exhale">("inhale");
  const [breathSeconds, setBreathSeconds] = useState(0);
  const [showBreathing, setShowBreathing] = useState(false);
  const [breathCycles, setBreathCycles] = useState(0);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const breathTimerRef = useRef<NodeJS.Timeout | null>(null);
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

  // Breathing exercise timer
  const INHALE_DURATION = 4;
  const HOLD_DURATION = 4;
  const EXHALE_DURATION = 6;

  const getPhaseTotal = useCallback(() => {
    if (breathPhase === "inhale") return INHALE_DURATION;
    if (breathPhase === "hold") return HOLD_DURATION;
    return EXHALE_DURATION;
  }, [breathPhase]);

  useEffect(() => {
    if (!showBreathing) {
      if (breathTimerRef.current) clearInterval(breathTimerRef.current);
      return;
    }

    setBreathPhase("inhale");
    setBreathSeconds(0);
    setBreathCycles(0);

    return () => {
      if (breathTimerRef.current) clearInterval(breathTimerRef.current);
    };
  }, [showBreathing]);

  useEffect(() => {
    if (!showBreathing) return;

    breathTimerRef.current = setInterval(() => {
      setBreathSeconds((prev) => {
        const total = breathPhase === "inhale" ? INHALE_DURATION
          : breathPhase === "hold" ? HOLD_DURATION
          : EXHALE_DURATION;

        if (prev >= total - 1) {
          if (breathPhase === "inhale") {
            setBreathPhase("hold");
          } else if (breathPhase === "hold") {
            setBreathPhase("exhale");
          } else {
            setBreathPhase("inhale");
            setBreathCycles((c) => c + 1);
          }
          return 0;
        }
        return prev + 1;
      });
    }, 1000);

    return () => {
      if (breathTimerRef.current) clearInterval(breathTimerRef.current);
    };
  }, [showBreathing, breathPhase]);

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const getCategoryLabel = (c: string) => {
    const map: Record<string, string> = {
      "Morning": "Morning Activation",
      "Anxiety": "Nervous System Reset",
      "Sleep": "Deep Recovery",
      "Self-Care": "Energy Restoration",
      "Breathing": "Focus Reset",
    };
    return map[c] || c;
  };

  const getCategoryIcon = (c: string) => {
    const icons: Record<string, string> = {
      "Morning": "⚡",
      "Anxiety": "🔋",
      "Sleep": "🌙",
      "Self-Care": "💪",
      "Breathing": "🧠",
    };
    return icons[c] || "🔋";
  };

  // ===== BREATHING EXERCISE OVERLAY =====
  if (showBreathing) {
    const phaseTotal = getPhaseTotal();
    const circleSize = breathPhase === "inhale"
      ? 140 + (breathSeconds / INHALE_DURATION) * 60
      : breathPhase === "hold"
      ? 200
      : 200 - (breathSeconds / EXHALE_DURATION) * 60;

    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "var(--bg-primary)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 50,
          padding: "32px",
        }}
      >
        <button
          onClick={() => setShowBreathing(false)}
          style={{
            position: "absolute",
            top: "24px",
            right: "24px",
            background: "var(--bg-glass)",
            border: "1px solid var(--border-color)",
            borderRadius: "var(--radius-md)",
            color: "var(--text-secondary)",
            cursor: "pointer",
            width: 40,
            height: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <X size={20} />
        </button>

        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "8px" }}>
          Cycle {breathCycles + 1}
        </p>

        <h2 style={{ fontSize: "1.3rem", fontWeight: 600, marginBottom: "48px", color: "var(--text-secondary)" }}>
          {breathPhase === "inhale" ? "Breathe In" : breathPhase === "hold" ? "Hold" : "Breathe Out"}
        </h2>

        {/* Animated breathing circle */}
        <div
          style={{
            width: circleSize,
            height: circleSize,
            borderRadius: "50%",
            background: breathPhase === "inhale"
              ? "linear-gradient(135deg, rgba(92, 140, 252, 0.3), rgba(92, 224, 216, 0.3))"
              : breathPhase === "hold"
              ? "linear-gradient(135deg, rgba(124, 92, 252, 0.3), rgba(92, 140, 252, 0.3))"
              : "linear-gradient(135deg, rgba(92, 224, 216, 0.3), rgba(124, 92, 252, 0.2))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 1s ease-in-out",
            boxShadow: `0 0 ${breathPhase === "hold" ? 60 : 30}px ${
              breathPhase === "inhale" ? "rgba(92, 224, 216, 0.2)" : "rgba(124, 92, 252, 0.2)"
            }`,
          }}
        >
          <span
            style={{
              fontSize: "2.5rem",
              fontWeight: 700,
              fontFamily: "var(--font-mono)",
              color: "var(--text-primary)",
            }}
          >
            {phaseTotal - breathSeconds}
          </span>
        </div>

        <p style={{
          marginTop: "48px",
          color: "var(--text-muted)",
          fontSize: "0.85rem",
          textAlign: "center",
          maxWidth: "300px",
          lineHeight: 1.6,
        }}>
          {breathPhase === "inhale" && "Slowly fill your lungs. Reset your nervous system."}
          {breathPhase === "hold" && "Hold. Notice the stillness. Let your body recalibrate."}
          {breathPhase === "exhale" && "Release slowly. Let go of tension and scattered energy."}
        </p>

        <button
          onClick={() => setShowBreathing(false)}
          className="btn-secondary"
          style={{ marginTop: "32px" }}
        >
          End Reset
        </button>
      </div>
    );
  }

  // ===== ACTIVE SESSION VIEW =====
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
            {getCategoryLabel(active.category)} · {formatTimer(active.duration_seconds)}
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

  // ===== MAIN PAGE =====
  return (
    <div style={{ padding: "32px", maxWidth: "900px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{ fontSize: "1.8rem", fontWeight: 700, marginBottom: "4px", display: "flex", alignItems: "center", gap: "10px" }}>
          <Battery size={28} style={{ color: "var(--accent-secondary)" }} />
          <span className="gradient-text">Recovery</span>
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>
          Structured recovery sessions to restore energy, reset focus, and prevent burnout.
        </p>
      </div>

      {/* Quick Focus Reset */}
      <div
        className="glass-card"
        style={{
          padding: "32px",
          marginBottom: "32px",
          cursor: "pointer",
          textAlign: "center",
          background: "linear-gradient(135deg, rgba(92, 224, 216, 0.05), rgba(124, 92, 252, 0.05))",
        }}
        onClick={() => setShowBreathing(true)}
      >
        <Wind size={24} style={{ color: "var(--accent-secondary)", marginBottom: "12px" }} />
        <h3 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "4px" }}>Quick Focus Reset</h3>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: "8px" }}>
          4-4-6 breathing protocol · Reset your nervous system in 2 minutes
        </p>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "0.85rem",
            color: "var(--accent-primary)",
            fontWeight: 500,
          }}
        >
          <Play size={14} />
          Start Reset
        </span>
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
              <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: "8px" }}>
                {session.description}
              </p>
              <span style={{ fontSize: "0.72rem", color: "var(--accent-primary)", fontWeight: 500 }}>
                {getCategoryLabel(session.category)}
              </span>
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
