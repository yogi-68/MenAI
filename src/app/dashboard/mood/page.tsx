"use client";

import { useState } from "react";
import { getMoodEmoji, getMoodLabel, getMoodColor, formatDate } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Plus,
  X,
  TrendingUp,
  TrendingDown,
  Minus,
  Zap,
  Moon,
  Check,
} from "lucide-react";

interface MoodEntry {
  id: string;
  mood_score: number;
  mood_label: string;
  emotions: string[];
  note: string;
  energy_level: number;
  sleep_hours: number;
  created_at: string;
}

const moodOptions = [
  { score: 1, emoji: "😞", label: "Terrible" },
  { score: 2, emoji: "😰", label: "Very Low" },
  { score: 3, emoji: "😢", label: "Sad" },
  { score: 4, emoji: "😕", label: "Down" },
  { score: 5, emoji: "😐", label: "Neutral" },
  { score: 6, emoji: "😌", label: "Okay" },
  { score: 7, emoji: "🙂", label: "Good" },
  { score: 8, emoji: "😊", label: "Great" },
  { score: 9, emoji: "🤩", label: "Amazing" },
  { score: 10, emoji: "🥳", label: "Incredible" },
];

const emotionOptions = [
  "😰 Anxious", "😢 Sad", "😠 Angry", "😨 Scared",
  "😊 Happy", "😌 Calm", "🥰 Loved", "😤 Frustrated",
  "🥱 Tired", "🤗 Grateful", "😔 Lonely", "💪 Confident",
  "🤔 Confused", "😴 Exhausted", "✨ Hopeful", "😣 Stressed",
];

const activityOptions = [
  "🏃 Exercise", "🧘 Meditation", "📖 Reading", "💤 Napping",
  "👥 Socializing", "🎵 Music", "🍳 Cooking", "🎨 Creative",
  "💼 Working", "🚶 Walking", "🎮 Gaming", "📱 Screen Time",
];

export default function MoodPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [selectedMood, setSelectedMood] = useState<number | null>(null);
  const [selectedEmotions, setSelectedEmotions] = useState<string[]>([]);
  const [selectedActivities, setSelectedActivities] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [energy, setEnergy] = useState<number>(3);
  const [sleep, setSleep] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const { data: entries = [], isLoading: loading } = useQuery<MoodEntry[]>({
    queryKey: ["mood-entries"],
    queryFn: async () => {
      const res = await fetch("/api/mood");
      if (!res.ok) return [];
      const data = await res.json();
      return data.entries || [];
    },
    staleTime: 30_000,
  });

  const handleSave = async () => {
    if (!selectedMood) return;
    setSaving(true);

    const res = await fetch("/api/mood", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mood_score: selectedMood,
        mood_label: getMoodLabel(selectedMood),
        emotions: selectedEmotions,
        note,
        activities: selectedActivities,
        energy_level: energy,
        sleep_hours: sleep ? parseFloat(sleep) : null,
      }),
    });

    if (res.ok) {
      queryClient.invalidateQueries({ queryKey: ["mood-entries"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      resetForm();
    }
    setSaving(false);
  };

  const resetForm = () => {
    setShowForm(false);
    setSelectedMood(null);
    setSelectedEmotions([]);
    setSelectedActivities([]);
    setNote("");
    setEnergy(3);
    setSleep("");
  };

  const toggleEmotion = (emotion: string) => {
    setSelectedEmotions((prev) =>
      prev.includes(emotion) ? prev.filter((e) => e !== emotion) : [...prev, emotion]
    );
  };

  const toggleActivity = (activity: string) => {
    setSelectedActivities((prev) =>
      prev.includes(activity) ? prev.filter((a) => a !== activity) : [...prev, activity]
    );
  };

  const avgMood = entries.length > 0
    ? Math.round((entries.reduce((sum, e) => sum + e.mood_score, 0) / entries.length) * 10) / 10
    : 0;

  const moodTrend = entries.length >= 2
    ? entries[0].mood_score - entries[entries.length - 1].mood_score
    : 0;

  return (
    <div style={{ padding: "32px", maxWidth: "900px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "32px" }}>
        <div>
          <h1 style={{ fontSize: "1.8rem", fontWeight: 700, marginBottom: "4px" }}>
            <span className="gradient-text">Energy & Focus</span>
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>
            Track your energy patterns to optimize execution
          </p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Plus size={18} />
          Log Energy
        </button>
      </div>

      {/* Stats Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "32px" }}>
        <div className="glass-card" style={{ padding: "20px", cursor: "default" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
            <Activity size={16} style={{ color: "var(--accent-primary)" }} />
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Avg Energy</span>
          </div>
          <div style={{ fontSize: "2rem", fontWeight: 700 }}>
            {avgMood > 0 ? `${avgMood}` : "—"}
          </div>
          <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
            {avgMood > 0 ? getMoodEmoji(avgMood) + " " + getMoodLabel(avgMood) : "No data yet"}
          </div>
        </div>

        <div className="glass-card" style={{ padding: "20px", cursor: "default" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
            {moodTrend > 0 ? <TrendingUp size={16} style={{ color: "var(--accent-secondary)" }} /> :
             moodTrend < 0 ? <TrendingDown size={16} style={{ color: "var(--accent-tertiary)" }} /> :
             <Minus size={16} style={{ color: "var(--text-muted)" }} />}
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Trend</span>
          </div>
          <div style={{ fontSize: "2rem", fontWeight: 700 }}>
            {moodTrend > 0 ? "↑" : moodTrend < 0 ? "↓" : "—"}
          </div>
          <div style={{ fontSize: "0.85rem", color: moodTrend > 0 ? "var(--accent-secondary)" : moodTrend < 0 ? "var(--accent-tertiary)" : "var(--text-secondary)" }}>
            {moodTrend > 0 ? "Improving" : moodTrend < 0 ? "Declining" : "Stable"}
          </div>
        </div>

        <div className="glass-card" style={{ padding: "20px", cursor: "default" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
            <Activity size={16} style={{ color: "var(--accent-warm)" }} />
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Total Entries</span>
          </div>
          <div style={{ fontSize: "2rem", fontWeight: 700 }}>{entries.length}</div>
          <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
            {entries.length > 0 ? `Since ${formatDate(entries[entries.length - 1]?.created_at)}` : "Start tracking"}
          </div>
        </div>
      </div>

      {/* Mood Bar Visualization */}
      {entries.length > 0 && (
        <div className="glass-card" style={{ padding: "24px", marginBottom: "32px", cursor: "default" }}>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "16px" }}>Energy Timeline</h3>
          <div style={{ display: "flex", alignItems: "flex-end", gap: "6px", height: "120px" }}>
            {entries.slice(0, 30).reverse().map((entry, i) => (
              <div
                key={entry.id}
                style={{
                  flex: 1,
                  minWidth: "8px",
                  height: `${(entry.mood_score / 10) * 100}%`,
                  background: getMoodColor(entry.mood_score),
                  borderRadius: "4px 4px 0 0",
                  opacity: 0.8,
                  transition: "all 0.3s ease",
                  cursor: "pointer",
                  position: "relative",
                }}
                title={`${getMoodLabel(entry.mood_score)} (${entry.mood_score}/10) - ${formatDate(entry.created_at)}`}
              />
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "8px", fontSize: "0.7rem", color: "var(--text-muted)" }}>
            <span>Older</span>
            <span>Today</span>
          </div>
        </div>
      )}

      {/* Entries List */}
      <h3 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "16px" }}>Recent Entries</h3>
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: "80px" }} />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="glass-card" style={{ padding: "48px", textAlign: "center", cursor: "default" }}>
          <Activity size={40} style={{ color: "var(--text-muted)", opacity: 0.3, marginBottom: "12px" }} />
          <p style={{ color: "var(--text-secondary)" }}>No entries yet. Start tracking your energy to find patterns.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {entries.map((entry) => (
            <div key={entry.id} className="glass-card" style={{ padding: "20px", cursor: "default" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                <div style={{ fontSize: "2rem" }}>{getMoodEmoji(entry.mood_score)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <span style={{ fontWeight: 600 }}>{entry.mood_label}</span>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        padding: "2px 8px",
                        borderRadius: "var(--radius-full)",
                        background: getMoodColor(entry.mood_score) + "20",
                        color: getMoodColor(entry.mood_score),
                        fontWeight: 600,
                      }}
                    >
                      {entry.mood_score}/10
                    </span>
                  </div>
                  {entry.note && (
                    <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "4px" }}>
                      {entry.note}
                    </p>
                  )}
                  {entry.emotions.length > 0 && (
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      {entry.emotions.map((e) => (
                        <span
                          key={e}
                          style={{
                            fontSize: "0.75rem",
                            padding: "2px 8px",
                            borderRadius: "var(--radius-full)",
                            background: "var(--bg-glass)",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {e}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "right" }}>
                  {formatDate(entry.created_at)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===== MOOD LOG MODAL ===== */}
      {showForm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            padding: "24px",
            animation: "fadeIn 0.2s ease-out",
          }}
          onClick={(e) => e.target === e.currentTarget && resetForm()}
        >
          <div
            className="animate-slide-up"
            style={{
              width: "100%",
              maxWidth: "560px",
              maxHeight: "85vh",
              overflowY: "auto",
              padding: "32px",
              cursor: "default",
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-color)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-lg)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
              <h2 style={{ fontSize: "1.3rem", fontWeight: 700 }}>How&apos;s your energy?</h2>
              <button onClick={resetForm} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>
                <X size={20} />
              </button>
            </div>

            {/* Mood Score Picker */}
            <div style={{ marginBottom: "28px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "10px" }}>
                {moodOptions.map((option) => (
                  <div
                    key={option.score}
                    onClick={() => setSelectedMood(option.score)}
                    className={`mood-option ${selectedMood === option.score ? "selected" : ""}`}
                  >
                    <span style={{ fontSize: "1.5rem" }}>{option.emoji}</span>
                    <span style={{ fontSize: "0.7rem", color: selectedMood === option.score ? "var(--accent-primary)" : "var(--text-muted)" }}>
                      {option.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Emotions */}
            <div style={{ marginBottom: "24px" }}>
              <label style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "10px", display: "block" }}>
                What&apos;s going on today?
              </label>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {emotionOptions.map((emotion) => (
                  <button
                    key={emotion}
                    onClick={() => toggleEmotion(emotion)}
                    style={{
                      padding: "6px 14px",
                      borderRadius: "var(--radius-full)",
                      background: selectedEmotions.includes(emotion) ? "rgba(124, 92, 252, 0.15)" : "var(--bg-glass)",
                      border: `1px solid ${selectedEmotions.includes(emotion) ? "var(--accent-primary)" : "var(--border-color)"}`,
                      color: selectedEmotions.includes(emotion) ? "var(--accent-primary)" : "var(--text-secondary)",
                      cursor: "pointer",
                      fontSize: "0.8rem",
                      transition: "all 0.2s",
                    }}
                  >
                    {emotion}
                  </button>
                ))}
              </div>
            </div>

            {/* Energy & Sleep */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "24px" }}>
              <div>
                <label style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Zap size={14} style={{ color: "var(--accent-warm)" }} />
                  Energy Level
                </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  {[1, 2, 3, 4, 5].map((level) => (
                    <button
                      key={level}
                      onClick={() => setEnergy(level)}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: "50%",
                        background: energy >= level ? "var(--accent-warm)" : "var(--bg-glass)",
                        border: "1px solid var(--border-color)",
                        color: energy >= level ? "white" : "var(--text-muted)",
                        cursor: "pointer",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        transition: "all 0.2s",
                      }}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Moon size={14} style={{ color: "var(--accent-primary)" }} />
                  Hours of Sleep
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="24"
                  value={sleep}
                  onChange={(e) => setSleep(e.target.value)}
                  placeholder="7.5"
                  className="input-field"
                />
              </div>
            </div>

            {/* Note */}
            <div style={{ marginBottom: "24px" }}>
              <label style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "8px", display: "block" }}>
                Any notes? (optional)
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What's on your mind today..."
                className="input-field"
                rows={3}
                style={{ resize: "none" }}
              />
            </div>

            {/* Save */}
            <button
              onClick={handleSave}
              disabled={!selectedMood || saving}
              className="btn-primary"
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                opacity: selectedMood && !saving ? 1 : 0.5,
              }}
            >
              {saving ? <span className="animate-spin">⏳</span> : <Check size={18} />}
              {saving ? "Saving..." : "Save Entry"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
