import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Spacing, BorderRadius, FontSizes } from "../theme";

// Built-in exercises (no DB dependency — always available)
const EXERCISES = [
  {
    id: "1",
    title: "Thought Reframing",
    description: "Challenge negative thought patterns with gentle cognitive restructuring",
    category: "Cognitive",
    icon: "🧠",
    difficulty: "beginner",
    duration: 5,
    steps: [
      "Write down the negative thought that's bothering you. Don't filter it — just get it out.",
      "What emotion comes with this thought? Name it. Sadness? Anger? Fear?",
      "How intensely do you feel it right now? (1-10)",
      "What evidence supports this thought? Be specific and honest.",
      "What evidence goes AGAINST this thought? Any exceptions?",
      "Can you write a more balanced version of the thought? Not positive — just more fair.",
      "How does the balanced version feel? Any shift in emotion?",
    ],
  },
  {
    id: "2",
    title: "5-4-3-2-1 Grounding",
    description: "Bring yourself back to the present moment using your senses",
    category: "Grounding",
    icon: "🌊",
    difficulty: "beginner",
    duration: 3,
    steps: [
      "Pause. Take one slow, deep breath.",
      "Name 5 things you can SEE around you right now.",
      "Name 4 things you can TOUCH or feel against your skin.",
      "Name 3 things you can HEAR.",
      "Name 2 things you can SMELL.",
      "Name 1 thing you can TASTE.",
      "Take another deep breath. How do you feel compared to a few minutes ago?",
    ],
  },
  {
    id: "3",
    title: "Gratitude Reflection",
    description: "Find small moments of light, even on heavy days",
    category: "Positive Psychology",
    icon: "✨",
    difficulty: "beginner",
    duration: 5,
    steps: [
      "Think about today. What's one moment that felt even slightly okay?",
      "Was there a person who made things a little better? Even in a small way?",
      "What's one thing about yourself you're grateful for? A skill, a quality, anything.",
      "Is there something simple that brought comfort today? Coffee, sunlight, music?",
      "Write a brief note of thanks — to yourself, someone else, or just to life.",
    ],
  },
  {
    id: "4",
    title: "Behavioral Activation",
    description: "Break paralysis with one tiny action",
    category: "Behavioral",
    icon: "🎯",
    difficulty: "beginner",
    duration: 5,
    steps: [
      "What's been weighing on you? Something you've been avoiding or struggling with?",
      "On a scale of 1-10, how overwhelmed do you feel about it?",
      "What is the SMALLEST possible step you could take? Think tiny — 2 minutes or less.",
      "Can you do that right now? Not later. Right now.",
      "If you did it — how do you feel? If not — what got in the way?",
      "One small step is still a step. That counts.",
    ],
  },
];

export default function ExercisesScreen() {
  const [selected, setSelected] = useState<(typeof EXERCISES)[0] | null>(null);
  const [currentStep, setCurrentStep] = useState(0);

  if (selected) {
    const steps = selected.steps;
    const progress = ((currentStep + 1) / steps.length) * 100;

    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => { setSelected(null); setCurrentStep(0); }}>
            <Ionicons name="arrow-back" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{selected.title}</Text>
          <View style={{ width: 22 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* Progress */}
          <View style={styles.progressRow}>
            <Text style={styles.progressText}>
              Step {currentStep + 1} of {steps.length}
            </Text>
            <Text style={styles.progressText}>{Math.round(progress)}%</Text>
          </View>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>

          {/* Step Content */}
          <View style={styles.stepCard}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>{currentStep + 1}</Text>
            </View>
            <Text style={styles.stepText}>{steps[currentStep]}</Text>
          </View>

          {/* Navigation */}
          <View style={styles.navRow}>
            <TouchableOpacity
              style={[styles.navBtn, currentStep === 0 && { opacity: 0.3 }]}
              onPress={() => setCurrentStep(Math.max(0, currentStep - 1))}
              disabled={currentStep === 0}
            >
              <Text style={styles.navBtnText}>Previous</Text>
            </TouchableOpacity>

            {currentStep < steps.length - 1 ? (
              <TouchableOpacity
                style={styles.navBtnPrimary}
                onPress={() => setCurrentStep(currentStep + 1)}
              >
                <Text style={styles.navBtnPrimaryText}>Next Step</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.navBtnPrimary}
                onPress={() => { setSelected(null); setCurrentStep(0); }}
              >
                <Ionicons name="checkmark-circle" size={18} color="#fff" />
                <Text style={styles.navBtnPrimaryText}>Complete</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>CBT Exercises</Text>
          <Text style={styles.headerSub}>Evidence-based tools for your wellbeing</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {EXERCISES.map((exercise) => (
          <TouchableOpacity
            key={exercise.id}
            style={styles.exerciseCard}
            onPress={() => setSelected(exercise)}
          >
            <Text style={{ fontSize: 32 }}>{exercise.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.exerciseTitle}>{exercise.title}</Text>
              <Text style={styles.exerciseDesc}>{exercise.description}</Text>
              <View style={styles.exerciseMeta}>
                <Text style={styles.metaText}>⏱ {exercise.duration} min</Text>
                <Text style={[styles.metaText, { color: Colors.success }]}>{exercise.difficulty}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Platform.OS === "ios" ? 56 : Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: FontSizes.xl, fontWeight: "700", color: Colors.textPrimary },
  headerSub: { fontSize: FontSizes.xs, color: Colors.textMuted, marginTop: 2 },
  content: { padding: Spacing.lg, paddingBottom: 100, gap: Spacing.md },
  exerciseCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.bgSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  exerciseTitle: { fontSize: FontSizes.md, fontWeight: "600", color: Colors.textPrimary },
  exerciseDesc: { fontSize: FontSizes.sm, color: Colors.textSecondary, marginTop: 2, lineHeight: 20 },
  exerciseMeta: { flexDirection: "row", gap: Spacing.md, marginTop: Spacing.sm },
  metaText: { fontSize: FontSizes.xs, color: Colors.textMuted },
  // Step view
  progressRow: { flexDirection: "row", justifyContent: "space-between" },
  progressText: { fontSize: FontSizes.xs, color: Colors.textMuted },
  progressBar: { height: 4, backgroundColor: Colors.bgSecondary, borderRadius: 2, marginTop: 6 },
  progressFill: { height: "100%", backgroundColor: Colors.primary, borderRadius: 2 },
  stepCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
    padding: Spacing.lg,
    backgroundColor: Colors.bgSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: Spacing.lg,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumberText: { color: "#fff", fontSize: FontSizes.xs, fontWeight: "700" },
  stepText: { flex: 1, fontSize: FontSizes.md, lineHeight: 24, color: Colors.textPrimary },
  navRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: Spacing.xl,
    gap: Spacing.md,
  },
  navBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    backgroundColor: Colors.bgSecondary,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  navBtnText: { color: Colors.textSecondary, fontWeight: "600" },
  navBtnPrimary: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
    flexDirection: "row",
    gap: Spacing.sm,
  },
  navBtnPrimaryText: { color: "#fff", fontWeight: "700" },
});
