"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAppStore } from "@/lib/store";
import { Settings, Shield, Target, Award, CheckCircle } from "lucide-react";

export default function SettingsPage() {
  const supabase = createClient();
  const { user, setUser } = useAppStore();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const [fullName, setFullName] = useState("");
  const [vision, setVision] = useState("");
  const [founderMode, setFounderMode] = useState(false);
  const [coachingStyle, setCoachingStyle] = useState("balanced");

  useEffect(() => {
    const loadProfile = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", authUser.id)
        .single();

      if (profile) {
        setFullName(profile.full_name || "");
        setVision(profile.vision || "");
        setFounderMode(profile.founder_mode || false);
        setCoachingStyle(profile.coaching_style || "balanced");
      }
      setLoading(false);
    };

    loadProfile();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);

    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName,
          vision: vision,
          founder_mode: founderMode,
          coaching_style: coachingStyle,
          updated_at: new Date().toISOString(),
        })
        .eq("id", authUser.id);

      if (error) throw error;

      // Update local Zustand store
      if (user) {
        setUser({
          ...user,
          full_name: fullName,
        });
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to save settings:", err);
      alert("Error saving settings. Please verify database schema migration has been applied.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "40px 32px", maxWidth: "800px", margin: "0 auto" }}>
        <div className="skeleton" style={{ height: "40px", width: "200px", marginBottom: "20px" }} />
        <div className="skeleton" style={{ height: "300px", width: "100%" }} />
      </div>
    );
  }

  return (
    <div style={{ padding: "40px 32px", maxWidth: "700px", margin: "0 auto" }}>
      {/* Header */}
      <div className="animate-fade-in" style={{ marginBottom: "32px" }}>
        <h1 style={{ fontSize: "1.8rem", fontWeight: 700, marginBottom: "6px", display: "flex", alignItems: "center", gap: "10px" }}>
          <Settings size={28} style={{ color: "var(--accent-primary)" }} />
          Execution Settings
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>
          Configure your AI coaching preferences, goals orientation, and founder context.
        </p>
      </div>

      {/* Main Settings Form */}
      <form onSubmit={handleSave} className="glass-card animate-slide-up" style={{ padding: "32px", cursor: "default" }}>
        
        {/* Name Field */}
        <div style={{ marginBottom: "24px" }}>
          <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "8px" }}>
            Full Name
          </label>
          <input
            type="text"
            className="input-field"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Your name"
            required
            style={{ width: "100%", background: "var(--bg-glass)", border: "1px solid var(--border-color)", padding: "12px", borderRadius: "var(--radius-md)", color: "var(--text-primary)" }}
          />
        </div>

        {/* Life Vision Field */}
        <div style={{ marginBottom: "24px" }}>
          <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "8px" }}>
            Life Vision & Trajectory
          </label>
          <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: "8px", lineHeight: 1.4 }}>
            Describe what you are building or trying to achieve. The AI Mentor uses this to keep you aligned and challenge excuse patterns.
          </p>
          <textarea
            className="input-field"
            value={vision}
            onChange={(e) => setVision(e.target.value)}
            placeholder="e.g. Building an automated AI platform to reach $10k MRR while staying physically fit and maintaining strong relationships."
            rows={4}
            style={{ width: "100%", background: "var(--bg-glass)", border: "1px solid var(--border-color)", padding: "12px", borderRadius: "var(--radius-md)", color: "var(--text-primary)", resize: "vertical" }}
          />
        </div>

        {/* Founder Mode Toggle */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "14px",
            padding: "18px",
            background: "rgba(124, 92, 252, 0.03)",
            border: "1px solid rgba(124, 92, 252, 0.15)",
            borderRadius: "var(--radius-md)",
            marginBottom: "24px",
          }}
        >
          <input
            type="checkbox"
            id="founderMode"
            checked={founderMode}
            onChange={(e) => setFounderMode(e.target.checked)}
            style={{ marginTop: "4px", width: "16px", height: "16px", cursor: "pointer", accentColor: "var(--accent-primary)" }}
          />
          <div style={{ flex: 1 }}>
            <label htmlFor="founderMode" style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.9rem", fontWeight: 700, color: "var(--text-primary)", cursor: "pointer" }}>
              <Shield size={16} style={{ color: "var(--accent-primary)" }} />
              Activate Founder Mode
            </label>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "4px", lineHeight: 1.4 }}>
              Tailor coaching specifically for startup founders and ambitious builders. Enables focus on shipping, MVP strategy, customer validation, and burnout prevention during sprints.
            </p>
          </div>
        </div>

        {/* Coaching Style Selection */}
        <div style={{ marginBottom: "32px" }}>
          <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "8px" }}>
            AI Mentorship Coaching Style
          </label>
          <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: "12px", lineHeight: 1.4 }}>
            Control the pressure level and approach of the AI. The mentor adapts its tone dynamically, but adheres to this core methodology.
          </p>
          
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            {[
              {
                value: "balanced",
                label: "Balanced",
                desc: "An optimal mix of strategic push and active reflection.",
              },
              {
                value: "push",
                label: "Execution Push",
                desc: "High accountability pressure. Confronts avoidance and excuses.",
              },
              {
                value: "gentle",
                label: "Gentle Guide",
                desc: "Compassionate, slow pacing. Highly supportive during high stress.",
              },
              {
                value: "strategic",
                label: "Systems Strategist",
                desc: "Focuses on business strategy, systems, and product thinking.",
              },
            ].map((style) => (
              <div
                key={style.value}
                onClick={() => setCoachingStyle(style.value)}
                style={{
                  padding: "16px",
                  borderRadius: "var(--radius-md)",
                  border: `2px solid ${coachingStyle === style.value ? "var(--accent-primary)" : "var(--border-color)"}`,
                  background: coachingStyle === style.value ? "rgba(124, 92, 252, 0.05)" : "var(--bg-glass)",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <span style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--text-primary)" }}>
                    {style.label}
                  </span>
                  {coachingStyle === style.value && (
                    <Award size={14} style={{ color: "var(--accent-primary)" }} />
                  )}
                </div>
                <p style={{ fontSize: "0.72rem", color: "var(--text-secondary)", lineHeight: 1.3 }}>
                  {style.desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            {success && (
              <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", color: "var(--accent-secondary)", fontWeight: 600 }}>
                <CheckCircle size={16} /> Settings saved successfully!
              </span>
            )}
          </div>
          <button
            type="submit"
            className="btn-primary"
            disabled={saving}
            style={{ padding: "12px 24px", minWidth: "120px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>

      </form>
    </div>
  );
}
