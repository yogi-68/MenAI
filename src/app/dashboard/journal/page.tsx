"use client";

import { useState, useEffect } from "react";
import { formatDate } from "@/lib/utils";
import { BookHeart, Plus, X, Sparkles, Loader2, Tag, Check } from "lucide-react";

interface JournalEntry {
  id: string;
  title: string;
  content: string;
  ai_insight: string;
  sentiment_score: number;
  emotions: string[];
  tags: string[];
  created_at: string;
}

export default function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);

  useEffect(() => {
    fetchEntries();
  }, []);

  const fetchEntries = async () => {
    const res = await fetch("/api/journal");
    if (res.ok) {
      const data = await res.json();
      setEntries(data.entries || []);
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!content.trim()) return;
    setSaving(true);

    const res = await fetch("/api/journal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title || "Untitled Entry", content, tags }),
    });

    if (res.ok) {
      await fetchEntries();
      resetForm();
    }
    setSaving(false);
  };

  const resetForm = () => {
    setShowForm(false);
    setTitle("");
    setContent("");
    setTags([]);
    setTagInput("");
  };

  const addTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput("");
    }
  };

  const getSentimentColor = (score: number) => {
    if (score > 0.3) return "var(--accent-secondary)";
    if (score < -0.3) return "var(--accent-tertiary)";
    return "var(--text-muted)";
  };

  const getSentimentLabel = (score: number) => {
    if (score > 0.5) return "Very Positive";
    if (score > 0.2) return "Positive";
    if (score > -0.2) return "Neutral";
    if (score > -0.5) return "Negative";
    return "Very Negative";
  };

  return (
    <div style={{ padding: "32px", maxWidth: "900px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "32px" }}>
        <div>
          <h1 style={{ fontSize: "1.8rem", fontWeight: 700, marginBottom: "4px" }}>
            <span className="gradient-text-warm">Journal</span>
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>
            Express yourself freely. AI provides gentle insights.
          </p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Plus size={18} />
          New Entry
        </button>
      </div>

      {/* Entries */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: "140px" }} />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="glass-card" style={{ padding: "64px", textAlign: "center", cursor: "default" }}>
          <BookHeart size={48} style={{ color: "var(--text-muted)", opacity: 0.3, marginBottom: "16px" }} />
          <h3 style={{ fontSize: "1.2rem", fontWeight: 600, marginBottom: "8px" }}>Your journal is empty</h3>
          <p style={{ color: "var(--text-secondary)", marginBottom: "24px" }}>
            Start writing to unlock AI-powered insights about your emotional patterns.
          </p>
          <button onClick={() => setShowForm(true)} className="btn-primary">
            Write Your First Entry
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gap: "16px" }}>
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="glass-card"
              style={{ padding: "24px", cursor: "pointer" }}
              onClick={() => setSelectedEntry(entry)}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 600 }}>{entry.title}</h3>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{formatDate(entry.created_at)}</span>
              </div>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.6, marginBottom: "12px" }}>
                {entry.content.slice(0, 200)}{entry.content.length > 200 ? "..." : ""}
              </p>

              {entry.ai_insight && (
                <div
                  style={{
                    padding: "12px 16px",
                    borderRadius: "var(--radius-md)",
                    background: "rgba(124, 92, 252, 0.05)",
                    border: "1px solid rgba(124, 92, 252, 0.1)",
                    marginBottom: "12px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                    <Sparkles size={12} style={{ color: "var(--accent-primary)" }} />
                    <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--accent-primary)" }}>AI Insight</span>
                  </div>
                  <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    {entry.ai_insight}
                  </p>
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                {entry.sentiment_score !== null && (
                  <span
                    style={{
                      fontSize: "0.75rem",
                      padding: "2px 10px",
                      borderRadius: "var(--radius-full)",
                      background: getSentimentColor(entry.sentiment_score) + "15",
                      color: getSentimentColor(entry.sentiment_score),
                      fontWeight: 500,
                    }}
                  >
                    {getSentimentLabel(entry.sentiment_score)}
                  </span>
                )}
                {entry.tags.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      fontSize: "0.75rem",
                      padding: "2px 10px",
                      borderRadius: "var(--radius-full)",
                      background: "var(--bg-glass)",
                      color: "var(--text-muted)",
                    }}
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===== NEW ENTRY MODAL ===== */}
      {showForm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            padding: "24px",
          }}
          onClick={(e) => e.target === e.currentTarget && resetForm()}
        >
          <div
            className="glass-card animate-slide-up"
            style={{
              width: "100%",
              maxWidth: "600px",
              maxHeight: "85vh",
              overflowY: "auto",
              padding: "32px",
              cursor: "default",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
              <h2 style={{ fontSize: "1.3rem", fontWeight: 700 }}>✍️ New Journal Entry</h2>
              <button onClick={resetForm} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title (optional)"
                className="input-field"
              />
            </div>

            <div style={{ marginBottom: "16px" }}>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write freely... What's on your mind today? How are you feeling? What happened?"
                className="input-field"
                rows={10}
                style={{ resize: "vertical", minHeight: "200px", lineHeight: 1.7 }}
              />
            </div>

            <div style={{ marginBottom: "24px" }}>
              <label style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
                <Tag size={14} />
                Tags
              </label>
              <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                  placeholder="Add a tag..."
                  className="input-field"
                  style={{ flex: 1 }}
                />
                <button onClick={addTag} className="btn-secondary" style={{ padding: "10px 16px" }}>
                  Add
                </button>
              </div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {tags.map((tag) => (
                  <span
                    key={tag}
                    onClick={() => setTags(tags.filter((t) => t !== tag))}
                    style={{
                      fontSize: "0.8rem",
                      padding: "4px 12px",
                      borderRadius: "var(--radius-full)",
                      background: "rgba(124, 92, 252, 0.1)",
                      color: "var(--accent-primary)",
                      cursor: "pointer",
                    }}
                  >
                    #{tag} ×
                  </span>
                ))}
              </div>
            </div>

            <button
              onClick={handleSave}
              disabled={!content.trim() || saving}
              className="btn-primary"
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                opacity: content.trim() && !saving ? 1 : 0.5,
              }}
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
              {saving ? "Saving & Analyzing..." : "Save Entry"}
            </button>

            <p style={{ textAlign: "center", fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "12px" }}>
              <Sparkles size={10} style={{ display: "inline" }} /> AI will analyze your entry and provide insights after saving.
            </p>
          </div>
        </div>
      )}

      {/* ===== ENTRY DETAIL MODAL ===== */}
      {selectedEntry && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            padding: "24px",
          }}
          onClick={(e) => e.target === e.currentTarget && setSelectedEntry(null)}
        >
          <div
            className="glass-card animate-slide-up"
            style={{
              width: "100%",
              maxWidth: "600px",
              maxHeight: "85vh",
              overflowY: "auto",
              padding: "32px",
              cursor: "default",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "20px" }}>
              <div>
                <h2 style={{ fontSize: "1.3rem", fontWeight: 700 }}>{selectedEntry.title}</h2>
                <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{formatDate(selectedEntry.created_at)}</span>
              </div>
              <button onClick={() => setSelectedEntry(null)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>
                <X size={20} />
              </button>
            </div>
            <p style={{ color: "var(--text-secondary)", lineHeight: 1.8, fontSize: "0.95rem", whiteSpace: "pre-wrap", marginBottom: "20px" }}>
              {selectedEntry.content}
            </p>
            {selectedEntry.ai_insight && (
              <div
                style={{
                  padding: "16px 20px",
                  borderRadius: "var(--radius-md)",
                  background: "rgba(124, 92, 252, 0.05)",
                  border: "1px solid rgba(124, 92, 252, 0.1)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                  <Sparkles size={14} style={{ color: "var(--accent-primary)" }} />
                  <span style={{ fontWeight: 600, color: "var(--accent-primary)", fontSize: "0.9rem" }}>AI Insight</span>
                </div>
                <p style={{ color: "var(--text-secondary)", lineHeight: 1.7, fontSize: "0.9rem" }}>
                  {selectedEntry.ai_insight}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
