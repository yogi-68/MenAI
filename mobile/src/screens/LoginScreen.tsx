import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { supabase } from "../lib/supabase";
import { Colors, Spacing, BorderRadius, FontSizes } from "../theme";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleAuth = async () => {
    if (!email || !password) {
      Alert.alert("Missing fields", "Please enter email and password.");
      return;
    }

    setLoading(true);
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        Alert.alert("Check your email", "We sent you a confirmation link.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error: any) {
      Alert.alert("Error", error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <View style={styles.inner}>
        {/* Logo */}
        <View style={styles.logoSection}>
          <Text style={styles.logo}>🧠</Text>
          <Text style={styles.title}>MenAI</Text>
          <Text style={styles.subtitle}>Your AI mental wellness companion</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={Colors.textMuted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={Colors.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleAuth}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>{isSignUp ? "Create Account" : "Sign In"}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setIsSignUp(!isSignUp)} style={styles.switchButton}>
            <Text style={styles.switchText}>
              {isSignUp ? "Already have an account? " : "Don't have an account? "}
              <Text style={styles.switchHighlight}>{isSignUp ? "Sign In" : "Sign Up"}</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  inner: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
  },
  logoSection: {
    alignItems: "center",
    marginBottom: Spacing.xxl,
  },
  logo: {
    fontSize: 56,
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: FontSizes.xxl,
    fontWeight: "800",
    color: Colors.primary,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  form: {
    gap: Spacing.md,
  },
  input: {
    height: 52,
    backgroundColor: Colors.bgSecondary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    fontSize: FontSizes.md,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  button: {
    height: 52,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontSize: FontSizes.md,
    fontWeight: "700",
  },
  switchButton: {
    alignItems: "center",
    marginTop: Spacing.md,
  },
  switchText: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
  },
  switchHighlight: {
    color: Colors.primary,
    fontWeight: "600",
  },
});
