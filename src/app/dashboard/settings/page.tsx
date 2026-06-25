"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAppStore } from "@/lib/store";
import { Settings, CheckCircle, Sun, Moon } from "lucide-react";

export default function SettingsPage() {
  const supabase = createClient();
  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const [fullName, setFullName] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const loadProfile = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", authUser.id)
        .maybeSingle();

      if (profile) {
        setFullName(profile.full_name || "");
      }

      const savedTheme = localStorage.getItem("menai-theme") as "light" | "dark" | null;
      setTheme(savedTheme || "light");

      setLoading(false);
    };

    loadProfile();
  }, [supabase]);

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
          updated_at: new Date().toISOString(),
        })
        .eq("id", authUser.id);

      if (error) throw error;

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

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    localStorage.setItem("menai-theme", newTheme);

    if (newTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

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
      <div className="animate-fade-in" style={{ marginBottom: "32px" }}>
        <h1 style={{ fontSize: "1.6rem", fontWeight: 700, marginBottom: "6px", display: "flex", alignItems: "center", gap: "10px" }}>
          <Settings size={24} style={{ color: "var(--accent-primary)" }} />
          Settings
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.88rem" }}>
          Your name and display preferences.
        </p>
      </div>

      <form onSubmit={handleSave} className="animate-slide-up" style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
        <div className="glass-card" style={{ padding: "28px" }}>
          <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>
            Theme
          </label>
          <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "14px", lineHeight: 1.4 }}>
            Switch between light and dark mode.
          </p>

          <button
            type="button"
            onClick={toggleTheme}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 18px",
              borderRadius: "var(--radius-md)",
              background: "var(--bg-glass)",
              border: "1px solid var(--border-color)",
              color: "var(--text-primary)",
              cursor: "pointer",
              fontSize: "0.9rem",
              fontWeight: 500,
              transition: "all 0.2s ease",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {theme === "light" ? <Sun size={18} /> : <Moon size={18} />}
              {theme === "light" ? "Light Mode" : "Dark Mode"}
            </span>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              Click to toggle
            </span>
          </button>
        </div>

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
