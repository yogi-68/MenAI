import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { Colors, Spacing, BorderRadius, FontSizes } from "../theme";

export default function ProfileScreen({ user }: { user: any }) {
  const handleSignOut = async () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await supabase.auth.signOut();
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* User Info */}
        <View style={styles.userCard}>
          <View style={styles.avatar}>
            <Text style={{ fontSize: 28 }}>🧠</Text>
          </View>
          <Text style={styles.userName}>{user?.email || "User"}</Text>
          <Text style={styles.userSub}>Free Plan</Text>
        </View>

        {/* Menu Items */}
        <View style={styles.menuSection}>
          <MenuItem icon="notifications-outline" label="Notifications" />
          <MenuItem icon="moon-outline" label="Dark Mode" />
          <MenuItem icon="shield-checkmark-outline" label="Privacy" />
          <MenuItem icon="help-circle-outline" label="Help & Support" />
          <MenuItem icon="document-text-outline" label="Terms of Service" />
        </View>

        {/* Sign Out */}
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={20} color={Colors.danger} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        {/* Disclaimer */}
        <Text style={styles.disclaimer}>
          MenAI is an AI wellness companion and is NOT a substitute for professional medical advice.
          If you're in crisis, call 988 or text HELLO to 741741.
        </Text>
      </ScrollView>
    </View>
  );
}

function MenuItem({ icon, label }: { icon: string; label: string }) {
  return (
    <TouchableOpacity style={styles.menuItem}>
      <Ionicons name={icon as any} size={20} color={Colors.textSecondary} />
      <Text style={styles.menuLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Platform.OS === "ios" ? 56 : Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: FontSizes.xl, fontWeight: "700", color: Colors.textPrimary },
  content: { padding: Spacing.lg, paddingBottom: 100, gap: Spacing.lg },
  userCard: {
    alignItems: "center",
    padding: Spacing.xl,
    backgroundColor: Colors.bgSecondary,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  userName: { fontSize: FontSizes.lg, fontWeight: "600", color: Colors.textPrimary },
  userSub: { fontSize: FontSizes.sm, color: Colors.textMuted, marginTop: 2 },
  menuSection: {
    backgroundColor: Colors.bgSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md + 2,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  menuLabel: { flex: 1, fontSize: FontSizes.md, color: Colors.textPrimary },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    backgroundColor: "rgba(239, 68, 68, 0.06)",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.15)",
  },
  signOutText: { color: Colors.danger, fontWeight: "600", fontSize: FontSizes.md },
  disclaimer: {
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: Spacing.md,
  },
});
