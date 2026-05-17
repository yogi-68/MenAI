import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  TextInput,
  Modal,
  Alert,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { Colors, Spacing, BorderRadius, FontSizes } from "../theme";

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

const emotionChips = [
  "😰 Anxious", "😢 Sad", "😠 Angry", "😊 Happy",
  "😌 Calm", "🥰 Loved", "🥱 Tired", "😔 Lonely",
  "💪 Confident", "✨ Hopeful", "😣 Stressed", "🤗 Grateful",
];

interface MoodEntry {
  id: string;
  mood_score: number;
  mood_label: string;
  emotions: string[];
  note: string;
  created_at: string;
}

const API_BASE = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

export default function MoodScreen() {
  const [entries, setEntries] = useState<MoodEntry[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedMood, setSelectedMood] = useState<number | null>(null);
  const [selectedEmotions, setSelectedEmotions] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchEntries();
  }, []);

  const fetchEntries = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    try {
      const res = await fetch(`${API_BASE}/api/mood`, {
        headers: { Authorization: `Bearer ${session?.access_token || ""}` },
      });
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
      }
    } catch { /* silent */ }
  };

  const handleSave = async () => {
    if (!selectedMood) return;
    setSaving(true);

    const { data: { session } } = await supabase.auth.getSession();
    try {
      const res = await fetch(`${API_BASE}/api/mood`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
        body: JSON.stringify({
          mood_score: selectedMood,
          mood_label: moodOptions.find((m) => m.score === selectedMood)?.label || "",
          emotions: selectedEmotions,
          note,
        }),
      });

      if (res.ok) {
        await fetchEntries();
        resetModal();
      }
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setSaving(false);
    }
  };

  const resetModal = () => {
    setShowModal(false);
    setSelectedMood(null);
    setSelectedEmotions([]);
    setNote("");
  };

  const toggleEmotion = (emotion: string) => {
    setSelectedEmotions((prev) =>
      prev.includes(emotion) ? prev.filter((e) => e !== emotion) : [...prev, emotion]
    );
  };

  const avgMood =
    entries.length > 0
      ? Math.round((entries.reduce((s, e) => s + e.mood_score, 0) / entries.length) * 10) / 10
      : 0;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Mood Tracker</Text>
          <Text style={styles.headerSub}>Track your emotional patterns</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowModal(true)}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Average</Text>
            <Text style={styles.statValue}>{avgMood > 0 ? avgMood : "—"}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Entries</Text>
            <Text style={styles.statValue}>{entries.length}</Text>
          </View>
        </View>

        {/* Mood Timeline */}
        {entries.length > 0 && (
          <View style={styles.timelineCard}>
            <Text style={styles.sectionTitle}>Mood Timeline</Text>
            <View style={styles.barChart}>
              {entries.slice(0, 14).reverse().map((entry) => (
                <View key={entry.id} style={styles.barWrapper}>
                  <View
                    style={[
                      styles.bar,
                      {
                        height: `${(entry.mood_score / 10) * 100}%`,
                        backgroundColor:
                          entry.mood_score >= 7
                            ? Colors.success
                            : entry.mood_score >= 4
                            ? Colors.warm
                            : Colors.danger,
                      },
                    ]}
                  />
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Recent Entries */}
        <Text style={styles.sectionTitle}>Recent Entries</Text>
        {entries.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="analytics-outline" size={40} color={Colors.textMuted} style={{ opacity: 0.3 }} />
            <Text style={styles.emptyText}>No mood entries yet. Tap + to log how you feel.</Text>
          </View>
        ) : (
          entries.map((entry) => (
            <View key={entry.id} style={styles.entryCard}>
              <Text style={{ fontSize: 28 }}>
                {moodOptions.find((m) => m.score === entry.mood_score)?.emoji || "😐"}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.entryTitle}>{entry.mood_label}</Text>
                {entry.note ? (
                  <Text style={styles.entryNote} numberOfLines={2}>
                    {entry.note}
                  </Text>
                ) : null}
                {entry.emotions?.length > 0 && (
                  <View style={styles.emotionRow}>
                    {entry.emotions.slice(0, 3).map((e) => (
                      <Text key={e} style={styles.emotionChip}>
                        {e}
                      </Text>
                    ))}
                  </View>
                )}
              </View>
              <Text style={styles.entryDate}>
                {new Date(entry.created_at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </Text>
            </View>
          ))
        )}
      </ScrollView>

      {/* ===== LOG MOOD MODAL ===== */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>How are you feeling?</Text>
              <TouchableOpacity onPress={resetModal}>
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Mood Picker */}
              <View style={styles.moodGrid}>
                {moodOptions.map((option) => (
                  <TouchableOpacity
                    key={option.score}
                    onPress={() => setSelectedMood(option.score)}
                    style={[
                      styles.moodOption,
                      selectedMood === option.score && styles.moodSelected,
                    ]}
                  >
                    <Text style={{ fontSize: 24 }}>{option.emoji}</Text>
                    <Text
                      style={[
                        styles.moodLabel,
                        selectedMood === option.score && { color: Colors.primary },
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Emotions */}
              <Text style={styles.fieldLabel}>What emotions are present?</Text>
              <View style={styles.chipGrid}>
                {emotionChips.map((emotion) => (
                  <TouchableOpacity
                    key={emotion}
                    onPress={() => toggleEmotion(emotion)}
                    style={[
                      styles.chip,
                      selectedEmotions.includes(emotion) && styles.chipSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        selectedEmotions.includes(emotion) && styles.chipTextSelected,
                      ]}
                    >
                      {emotion}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Note */}
              <Text style={styles.fieldLabel}>Any notes? (optional)</Text>
              <TextInput
                style={styles.noteInput}
                placeholder="What's on your mind..."
                placeholderTextColor={Colors.textMuted}
                value={note}
                onChangeText={setNote}
                multiline
                numberOfLines={3}
              />

              {/* Save */}
              <TouchableOpacity
                style={[styles.saveBtn, (!selectedMood || saving) && { opacity: 0.5 }]}
                onPress={handleSave}
                disabled={!selectedMood || saving}
              >
                <Text style={styles.saveBtnText}>{saving ? "Saving..." : "Save Entry"}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingTop: Platform.OS === "ios" ? 56 : Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: FontSizes.xl, fontWeight: "700", color: Colors.textPrimary },
  headerSub: { fontSize: FontSizes.xs, color: Colors.textMuted, marginTop: 2 },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  content: { padding: Spacing.lg, paddingBottom: 100, gap: Spacing.md },
  statsRow: { flexDirection: "row", gap: Spacing.md },
  statCard: {
    flex: 1,
    backgroundColor: Colors.bgSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statLabel: { fontSize: FontSizes.xs, color: Colors.textMuted, marginBottom: 4 },
  statValue: { fontSize: FontSizes.xxl, fontWeight: "700", color: Colors.textPrimary },
  timelineCard: {
    backgroundColor: Colors.bgSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionTitle: { fontSize: FontSizes.md, fontWeight: "600", color: Colors.textPrimary, marginBottom: Spacing.sm },
  barChart: { flexDirection: "row", height: 80, alignItems: "flex-end", gap: 4 },
  barWrapper: { flex: 1, height: "100%", justifyContent: "flex-end" },
  bar: { borderRadius: 3, minHeight: 4 },
  emptyCard: {
    alignItems: "center",
    padding: Spacing.xxl,
    backgroundColor: Colors.bgSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
  },
  emptyText: { color: Colors.textSecondary, fontSize: FontSizes.sm, textAlign: "center" },
  entryCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.bgSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  entryTitle: { fontSize: FontSizes.md, fontWeight: "600", color: Colors.textPrimary },
  entryNote: { fontSize: FontSizes.sm, color: Colors.textSecondary, marginTop: 2 },
  entryDate: { fontSize: FontSizes.xs, color: Colors.textMuted },
  emotionRow: { flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 4 },
  emotionChip: {
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    backgroundColor: Colors.bgGlass,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: Colors.bgPrimary,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    maxHeight: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  modalTitle: { fontSize: FontSizes.lg, fontWeight: "700", color: Colors.textPrimary },
  moodGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  moodOption: {
    width: "18%",
    alignItems: "center",
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "transparent",
  },
  moodSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  moodLabel: { fontSize: 10, color: Colors.textMuted, marginTop: 4 },
  fieldLabel: {
    fontSize: FontSizes.sm,
    fontWeight: "600",
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
    marginTop: Spacing.sm,
  },
  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.bgSecondary,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  chipText: { fontSize: FontSizes.xs, color: Colors.textSecondary },
  chipTextSelected: { color: Colors.primary },
  noteInput: {
    backgroundColor: Colors.bgSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSizes.md,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 80,
    textAlignVertical: "top",
  },
  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: "center",
    marginTop: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  saveBtnText: { color: "#fff", fontSize: FontSizes.md, fontWeight: "700" },
});
