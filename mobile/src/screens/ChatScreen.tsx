import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { Colors, Spacing, BorderRadius, FontSizes } from "../theme";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  crisis?: boolean;
}

const API_BASE = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

export default function ChatScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    const text = input.trim();
    setInput("");
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token || ""}`,
        },
        body: JSON.stringify({
          message: text,
          conversationId,
        }),
      });

      const data = await res.json();

      if (data.conversationId && !conversationId) {
        setConversationId(data.conversationId);
      }

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.response || "I'm here for you. Tell me more.",
        created_at: new Date().toISOString(),
        crisis: data.crisis,
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "Sorry, I had a moment there. Could you try again? 💙",
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === "user";
    return (
      <View
        style={[
          styles.messageBubble,
          isUser ? styles.userBubble : styles.aiBubble,
        ]}
      >
        {!isUser && (
          <View style={styles.aiAvatar}>
            <Text style={{ fontSize: 16 }}>🧠</Text>
          </View>
        )}
        <View
          style={[
            styles.messageContent,
            isUser ? styles.userContent : styles.aiContent,
          ]}
        >
          <Text
            style={[
              styles.messageText,
              isUser ? styles.userText : styles.aiText,
            ]}
          >
            {item.content}
          </Text>
        </View>
      </View>
    );
  };

  // Welcome message
  const allMessages: Message[] =
    messages.length === 0
      ? [
          {
            id: "welcome",
            role: "assistant",
            content:
              "Hey there. I'm MenAI — your AI wellness companion. I'm here to listen, support, and help however I can. What's on your mind?",
            created_at: new Date().toISOString(),
          },
        ]
      : messages;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={{ fontSize: 20 }}>🧠</Text>
        <View>
          <Text style={styles.headerTitle}>MenAI</Text>
          <Text style={styles.headerSubtitle}>Your wellness companion</Text>
        </View>
        <TouchableOpacity
          style={styles.newChatBtn}
          onPress={() => {
            setMessages([]);
            setConversationId(null);
          }}
        >
          <Ionicons name="add" size={20} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={allMessages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() =>
          flatListRef.current?.scrollToEnd({ animated: true })
        }
      />

      {/* Crisis banner */}
      {messages.some((m) => m.crisis) && (
        <View style={styles.crisisBanner}>
          <Ionicons name="alert-circle" size={16} color={Colors.danger} />
          <Text style={styles.crisisText}>
            If you're in crisis, call <Text style={{ fontWeight: "700" }}>988</Text> or text HELLO
            to <Text style={{ fontWeight: "700" }}>741741</Text>
          </Text>
        </View>
      )}

      {/* Input */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="How are you feeling..."
          placeholderTextColor={Colors.textMuted}
          value={input}
          onChangeText={setInput}
          multiline
          maxLength={2000}
          returnKeyType="default"
        />
        <TouchableOpacity
          style={[styles.sendButton, (!input.trim() || loading) && styles.sendDisabled]}
          onPress={sendMessage}
          disabled={!input.trim() || loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="send" size={18} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Platform.OS === "ios" ? 56 : Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.bgPrimary,
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: "700",
    color: Colors.primary,
  },
  headerSubtitle: {
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
  newChatBtn: {
    marginLeft: "auto",
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  messageList: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  messageBubble: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  userBubble: {
    justifyContent: "flex-end",
  },
  aiBubble: {
    justifyContent: "flex-start",
  },
  aiAvatar: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  messageContent: {
    maxWidth: "78%",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 4,
    borderRadius: BorderRadius.lg,
  },
  userContent: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
    marginLeft: "auto",
  },
  aiContent: {
    backgroundColor: Colors.bgSecondary,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  messageText: {
    fontSize: FontSizes.md,
    lineHeight: 22,
  },
  userText: {
    color: "#fff",
  },
  aiText: {
    color: Colors.textPrimary,
  },
  crisisBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: "rgba(252, 92, 156, 0.08)",
    borderTopWidth: 1,
    borderTopColor: "rgba(252, 92, 156, 0.15)",
  },
  crisisText: {
    fontSize: FontSizes.xs,
    color: Colors.danger,
    flex: 1,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.bgPrimary,
    paddingBottom: Platform.OS === "ios" ? Spacing.lg : Spacing.sm,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: Colors.bgSecondary,
    borderRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    fontSize: FontSizes.md,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendDisabled: {
    opacity: 0.4,
  },
});
