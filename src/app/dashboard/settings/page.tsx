"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAppStore } from "@/lib/store";
import { Settings, CheckCircle, ChevronDown } from "lucide-react";

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
  const [showAdvanced, setShowAdvanced] = useState(false);

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
      alert("Error saving settings. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // Map internal values to display labels
  const coachingOptions = [
    { value: "gentle", label: "Supportive" },
    { value: "balanced", label: "Balanced" },
    { value: "push", label: "Direct" },
  ];

  if (loading) {
    return (
      <div style={{ padding: "40px 32px", maxWidth: "700px", margin: "0 auto" }}>
        <div className="skeleton" style={{ height: "40px", width: "200px", marginBottom: "20px" }} />
        <div className="skeleton" style={{ height: "300px", width: "100%" }} />
      </div>
    );
  }

  return (
    <div style={{ padding: "40px 32px", maxWidth: "640px", margin: "0 auto" }}>
      {/* Header */}
      <div className="animate-fade-in" style={{ marginBottom: "32px" }}>
        <h1 style={{ fontSize: "1.6rem", fontWeight: 700, marginBottom: "6px", display: "flex", alignItems: "center", gap: "10px" }}>
          <Settings size={24} style={{ color: "var(--accent-primary)" }} />
          Settings
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.88rem" }}>
          MenAI adapts to you over time. These are lightweight preferences.
        </p>
      </div>

      {/* Main Form */}
      <form onSubmit={handleSave} className="animate-slide-up" style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
        
        {/* Section 1 — Profile */}
        <div className="glass-card" style={{ padding: "28px" }}>
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

        {/* Section 2 — Direction */}
        <div className="glass-card" style={{ padding: "28px" }}>
          <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>
            What are you trying to move toward right now?
          </label>
          <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "10px", lineHeight: 1.4 }}>
            This helps MenAI understand your direction and give more aligned guidance over time.
          </p>
          <textarea
            className="input-field"
            value={vision}
            onChange={(e) => setVision(e.target.value)}
            placeholder="e.g. Building an AI SaaS, improving consistency, finding clearer direction..."
            rows={3}
            style={{ width: "100%", background: "var(--bg-glass)", border: "1px solid var(--border-color)", padding: "12px", borderRadius: "var(--radius-md)", color: "var(--text-primary)", resize: "vertical" }}
          />
        </div>

        {/* Section 3 — Coaching Style */}
        <div className="glass-card" style={{ padding: "28px" }}>
          <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>
            Coaching Style
          </label>
          <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "14px", lineHeight: 1.4 }}>
            MenAI adapts naturally over time, but this controls how gently or directly it challenges you.
          </p>
          
          <div style={{
            display: "flex",
            background: "var(--bg-glass)",
            border: "1px solid var(--border-color)",
            borderRadius: "var(--radius-md)",
            padding: "4px",
          }}>
            {coachingOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setCoachingStyle(opt.value)}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  borderRadius: "calc(var(--radius-md) - 2px)",
                  border: "none",
                  background: coachingStyle === opt.value ? "var(--accent-primary)" : "transparent",
                  color: coachingStyle === opt.value ? "white" : "var(--text-secondary)",
                  cursor: "pointer",
                  fontSize: "0.85rem",
                  fontWeight: coachingStyle === opt.value ? 600 : 500,
                  transition: "all 0.2s ease",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Advanced Section — Collapsed */}
        <div className="glass-card" style={{ padding: "0", overflow: "hidden" }}>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            style={{
              width: "100%",
              padding: "18px 28px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-secondary)",
              fontSize: "0.85rem",
              fontWeight: 600,
            }}
          >
            Advanced
            <ChevronDown
              size={16}
              style={{
                transition: "transform 0.2s ease",
                transform: showAdvanced ? "rotate(180deg)" : "rotate(0deg)",
              }}
            />
          </button>
          
          {showAdvanced && (
            <div style={{ padding: "0 28px 24px", borderTop: "1px solid var(--border-color)" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "14px",
                  paddingTop: "18px",
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
                  <label htmlFor="founderMode" style={{ display: "block", fontSize: "0.88rem", fontWeight: 600, color: "var(--text-primary)", cursor: "pointer" }}>
                    Founder-oriented coaching
                  </label>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "4px", lineHeight: 1.4 }}>
                    Prioritizes shipping, product thinking, and execution momentum.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Save Button */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            {success && (
              <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", color: "var(--accent-secondary)", fontWeight: 600 }}>
                <CheckCircle size={16} /> Saved
              </span>
            )}
          </div>
          <button
            type="submit"
            className="btn-primary"
            disabled={saving}
            style={{ padding: "12px 28px", minWidth: "100px" }}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
