"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Dumbbell, Clock, Tag, ChevronRight, CheckCircle2, ArrowLeft } from "lucide-react";

interface Exercise {
  id: string;
  title: string;
  description: string;
  category: string;
  difficulty: string;
  duration_minutes: number;
  instructions: { steps: string[] };
  tags: string[];
}

export default function ExercisesPage() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [selected, setSelected] = useState<Exercise | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const fetchExercises = async () => {
      const { data } = await supabase
        .from("cbt_exercises")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: true });
      setExercises(data || []);
      setLoading(false);
    };
    fetchExercises();
  }, []);

  const getDifficultyColor = (d: string) => {
    if (d === "beginner") return "var(--accent-secondary)";
    if (d === "intermediate") return "var(--accent-warm)";
    return "var(--accent-tertiary)";
  };

  const getCategoryIcon = (c: string) => {
    const icons: Record<string, string> = {
      "Cognitive Restructuring": "🧠",
      "Positive Psychology": "✨",
      "Relaxation": "🌊",
      "Behavioral": "🎯",
      "Mindfulness": "🧘",
    };
    return icons[c] || "💡";
  };

  if (selected) {
    const steps = selected.instructions.steps || [];
    return (
      <div style={{ padding: "32px", maxWidth: "700px", margin: "0 auto" }}>
        <button
          onClick={() => { setSelected(null); setCurrentStep(0); }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "none",
            border: "none",
            color: "var(--text-secondary)",
            cursor: "pointer",
            marginBottom: "24px",
            fontSize: "0.9rem",
          }}
        >
          <ArrowLeft size={18} />
          Back to exercises
        </button>

        <div className="glass-card" style={{ padding: "32px", cursor: "default" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
            <span style={{ fontSize: "2rem" }}>{getCategoryIcon(selected.category)}</span>
            <div>
              <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>{selected.title}</h1>
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                {selected.category} · {selected.duration_minutes} min
              </p>
            </div>
          </div>

          <p style={{ color: "var(--text-secondary)", lineHeight: 1.7, margin: "16px 0 32px" }}>
            {selected.description}
          </p>

          {/* Progress Bar */}
          <div style={{ marginBottom: "32px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "8px" }}>
              <span>Step {currentStep + 1} of {steps.length}</span>
              <span>{Math.round(((currentStep + 1) / steps.length) * 100)}%</span>
            </div>
            <div style={{ height: "4px", borderRadius: "2px", background: "var(--bg-glass)" }}>
              <div
                style={{
                  height: "100%",
                  width: `${((currentStep + 1) / steps.length) * 100}%`,
                  borderRadius: "2px",
                  background: "var(--gradient-primary)",
                  transition: "width 0.3s ease",
                }}
              />
            </div>
          </div>

          {/* Current Step */}
          <div
            className="animate-fade-in"
            key={currentStep}
            style={{
              padding: "24px",
              borderRadius: "var(--radius-md)",
              background: "rgba(124, 92, 252, 0.05)",
              border: "1px solid rgba(124, 92, 252, 0.1)",
              marginBottom: "24px",
              minHeight: "80px",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: "var(--gradient-primary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  color: "white",
                  flexShrink: 0,
                }}
              >
                {currentStep + 1}
              </div>
              <p style={{ fontSize: "1rem", lineHeight: 1.7, color: "var(--text-primary)" }}>
                {steps[currentStep]}
              </p>
            </div>
          </div>

          {/* Navigation */}
          <div style={{ display: "flex", gap: "12px", justifyContent: "space-between" }}>
            <button
              onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
              disabled={currentStep === 0}
              className="btn-secondary"
              style={{ opacity: currentStep === 0 ? 0.4 : 1 }}
            >
              Previous
            </button>
            {currentStep < steps.length - 1 ? (
              <button onClick={() => setCurrentStep(currentStep + 1)} className="btn-primary">
                Next Step
              </button>
            ) : (
              <button
                onClick={() => { setSelected(null); setCurrentStep(0); }}
                className="btn-primary"
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <CheckCircle2 size={18} />
                Complete
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "32px", maxWidth: "900px", margin: "0 auto" }}>
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{ fontSize: "1.8rem", fontWeight: 700, marginBottom: "4px" }}>
          <span className="gradient-text">CBT Exercises</span>
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>
          Evidence-based techniques for cognitive behavioral wellness
        </p>
      </div>

      {loading ? (
        <div style={{ display: "grid", gap: "16px" }}>
          {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: "120px" }} />)}
        </div>
      ) : (
        <div style={{ display: "grid", gap: "16px" }}>
          {exercises.map((exercise) => (
            <div
              key={exercise.id}
              className="glass-card"
              style={{ padding: "24px", cursor: "pointer", display: "flex", alignItems: "center", gap: "20px" }}
              onClick={() => setSelected(exercise)}
            >
              <div style={{ fontSize: "2.5rem" }}>{getCategoryIcon(exercise.category)}</div>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "6px" }}>{exercise.title}</h3>
                <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: "10px" }}>
                  {exercise.description}
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    <Clock size={12} /> {exercise.duration_minutes} min
                  </span>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      padding: "2px 8px",
                      borderRadius: "var(--radius-full)",
                      background: getDifficultyColor(exercise.difficulty) + "15",
                      color: getDifficultyColor(exercise.difficulty),
                      fontWeight: 500,
                      textTransform: "capitalize",
                    }}
                  >
                    {exercise.difficulty}
                  </span>
                  {exercise.tags.slice(0, 3).map((tag) => (
                    <span key={tag} style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>#{tag}</span>
                  ))}
                </div>
              </div>
              <ChevronRight size={20} style={{ color: "var(--text-muted)" }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
