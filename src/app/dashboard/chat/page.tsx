"use client";

import { useState, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAppStore } from "@/lib/store";
import { formatTime } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import {
  Send,
  Loader2,
  Plus,
  Brain,
  AlertTriangle,
  Phone,
  MessageSquare,
  Trash2,
} from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  crisis?: boolean;
}

interface CrisisResource {
  name: string;
  phone: string;
  text?: string;
}

export default function ChatPage() {
  const { user } = useAppStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [crisisAlert, setCrisisAlert] = useState(false);
  const [conversations, setConversations] = useState<any[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const supabase = createClient();

  // Load conversations list
  useEffect(() => {
    const loadConversations = async () => {
      const res = await fetch("/api/conversations");
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    };
    loadConversations();
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  };

  // Load conversation messages
  const loadConversation = async (convId: string) => {
    const res = await fetch(`/api/conversations/${convId}`);
    if (res.ok) {
      const data = await res.json();
      setMessages(
        (data.messages || []).map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          created_at: m.created_at,
        }))
      );
      setConversationId(convId);
    }
  };

  // Start new conversation
  const startNewChat = () => {
    setMessages([]);
    setConversationId(null);
    setCrisisAlert(false);
    setInput("");
  };

  // Delete conversation
  const deleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this conversation? This cannot be undone.")) return;

    const res = await fetch(`/api/conversations/${convId}`, { method: "DELETE" });
    if (res.ok) {
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (conversationId === convId) {
        startNewChat();
      }
    }
  };

  // Send message
  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage.content,
          conversationId,
        }),
      });

      const data = await res.json();

      if (data.crisis) {
        setCrisisAlert(true);
      }

      if (data.conversationId && !conversationId) {
        setConversationId(data.conversationId);
        // Refresh conversation list
        const convRes = await fetch("/api/conversations");
        if (convRes.ok) {
          const convData = await convRes.json();
          setConversations(convData.conversations || []);
        }
      }

      const aiMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.response || "I'm here for you. Could you tell me more?",
        created_at: new Date().toISOString(),
        crisis: data.crisis,
      };

      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "I'm sorry, I had a moment there. Could you try saying that again? 💙",
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      {/* ===== CONVERSATION SIDEBAR ===== */}
      <div
        style={{
          width: "260px",
          borderRight: "1px solid var(--border-color)",
          background: "var(--bg-secondary)",
          display: "flex",
          flexDirection: "column",
          padding: "16px",
          overflowY: "auto",
        }}
      >
        <button
          onClick={startNewChat}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            padding: "12px",
            borderRadius: "var(--radius-md)",
            background: "var(--bg-glass)",
            border: "1px solid var(--border-color)",
            color: "var(--text-primary)",
            cursor: "pointer",
            fontWeight: 500,
            fontSize: "0.9rem",
            marginBottom: "16px",
            transition: "all 0.2s",
          }}
        >
          <Plus size={18} />
          New Conversation
        </button>

        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          Recent Chats
        </div>

        {conversations.map((conv) => (
          <div
            key={conv.id}
            onClick={() => loadConversation(conv.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 12px",
              borderRadius: "var(--radius-md)",
              cursor: "pointer",
              marginBottom: "4px",
              transition: "all 0.2s",
              background: conversationId === conv.id ? "rgba(124, 92, 252, 0.1)" : "transparent",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: "0.85rem",
                  fontWeight: conversationId === conv.id ? 600 : 400,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  color: conversationId === conv.id ? "var(--accent-primary)" : "var(--text-secondary)",
                }}
              >
                {conv.title || "Untitled"}
              </div>
              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "2px" }}>
                {formatTime(conv.updated_at)}
              </div>
            </div>
            <button
              onClick={(e) => deleteConversation(conv.id, e)}
              title="Delete conversation"
              style={{
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                padding: "4px",
                borderRadius: "4px",
                opacity: 0.4,
                transition: "all 0.2s",
                flexShrink: 0,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.color = "var(--accent-tertiary)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.4"; e.currentTarget.style.color = "var(--text-muted)"; }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}

        {conversations.length === 0 && (
          <div style={{ textAlign: "center", padding: "24px", color: "var(--text-muted)", fontSize: "0.85rem" }}>
            <MessageSquare size={24} style={{ opacity: 0.3, marginBottom: "8px" }} />
            <p>No conversations yet.</p>
            <p>Start chatting!</p>
          </div>
        )}
      </div>

      {/* ===== CHAT AREA ===== */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {/* Crisis Alert Banner */}
        {crisisAlert && (
          <div
            style={{
              padding: "12px 20px",
              background: "rgba(252, 92, 156, 0.1)",
              borderBottom: "1px solid rgba(252, 92, 156, 0.2)",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              animation: "slideDown 0.3s ease-out",
            }}
          >
            <AlertTriangle size={18} style={{ color: "var(--accent-tertiary)", flexShrink: 0 }} />
            <span style={{ fontSize: "0.85rem", color: "var(--accent-tertiary)" }}>
              If you&apos;re in crisis, please call <strong>988</strong> or text <strong>HELLO</strong> to <strong>741741</strong>
            </span>
            <a
              href="tel:988"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                padding: "6px 12px",
                borderRadius: "var(--radius-full)",
                background: "rgba(252, 92, 156, 0.2)",
                color: "var(--accent-tertiary)",
                textDecoration: "none",
                fontSize: "0.8rem",
                fontWeight: 600,
                marginLeft: "auto",
                flexShrink: 0,
              }}
            >
              <Phone size={14} />
              Call 988
            </a>
          </div>
        )}

        {/* Messages */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "24px",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          {messages.length === 0 && (
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                gap: "16px",
                animation: "fadeIn 0.5s ease-out",
              }}
            >
              <div
                className="animate-float"
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: "50%",
                  background: "var(--gradient-primary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Brain size={40} color="white" />
              </div>
              <h2 style={{ fontSize: "1.5rem", fontWeight: 700 }}>
                Hi, I&apos;m <span className="gradient-text">MenAI</span>
              </h2>
              <p style={{ color: "var(--text-secondary)", maxWidth: "400px", lineHeight: 1.6 }}>
                I&apos;m your compassionate AI wellness companion. Talk to me about anything — 
                how you&apos;re feeling, what&apos;s on your mind, or if you just need someone to listen.
              </p>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center", marginTop: "8px" }}>
                {["I'm feeling anxious", "Help me sleep", "I need to vent", "Breathing exercise"].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => {
                      setInput(suggestion);
                      inputRef.current?.focus();
                    }}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "var(--radius-full)",
                      background: "var(--bg-glass)",
                      border: "1px solid var(--border-color)",
                      color: "var(--text-secondary)",
                      cursor: "pointer",
                      fontSize: "0.85rem",
                      transition: "all 0.2s",
                    }}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                display: "flex",
                justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                alignItems: "flex-start",
                gap: "12px",
              }}
            >
              {msg.role === "assistant" && (
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: "var(--gradient-primary)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    marginTop: "4px",
                  }}
                >
                  <Brain size={16} color="white" />
                </div>
              )}

              <div className={msg.role === "user" ? "chat-bubble-user" : "chat-bubble-ai"}>
                {msg.role === "assistant" ? (
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => <p style={{ margin: "0 0 8px", lineHeight: 1.7, fontSize: "0.95rem" }}>{children}</p>,
                      strong: ({ children }) => <strong style={{ color: "var(--accent-primary)", fontWeight: 600 }}>{children}</strong>,
                      ul: ({ children }) => <ul style={{ paddingLeft: "16px", margin: "8px 0" }}>{children}</ul>,
                      li: ({ children }) => <li style={{ marginBottom: "4px", fontSize: "0.95rem" }}>{children}</li>,
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                ) : (
                  <p style={{ margin: 0, lineHeight: 1.7, fontSize: "0.95rem" }}>{msg.content}</p>
                )}
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "8px" }}>
                  {formatTime(msg.created_at)}
                </div>
              </div>

              {msg.role === "user" && (
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: "var(--gradient-warm)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    marginTop: "4px",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    color: "white",
                  }}
                >
                  {user?.full_name?.charAt(0)?.toUpperCase() || "U"}
                </div>
              )}
            </div>
          ))}

          {/* Typing indicator */}
          {loading && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: "var(--gradient-primary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Brain size={16} color="white" />
              </div>
              <div className="chat-bubble-ai">
                <div className="typing-indicator">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid var(--border-color)",
            background: "var(--bg-secondary)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: "12px",
              maxWidth: "800px",
              margin: "0 auto",
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Share what's on your mind..."
              rows={1}
              style={{
                flex: 1,
                background: "var(--bg-glass)",
                border: "1px solid var(--border-color)",
                borderRadius: "var(--radius-lg)",
                padding: "14px 18px",
                color: "var(--text-primary)",
                fontFamily: "var(--font-sans)",
                fontSize: "0.95rem",
                resize: "none",
                outline: "none",
                transition: "border-color 0.3s",
                lineHeight: 1.5,
                maxHeight: "120px",
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: input.trim() ? "var(--gradient-primary)" : "var(--bg-glass)",
                border: "none",
                cursor: input.trim() ? "pointer" : "not-allowed",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.3s",
                flexShrink: 0,
              }}
            >
              {loading ? (
                <Loader2 size={20} color="white" className="animate-spin" />
              ) : (
                <Send size={20} color={input.trim() ? "white" : "var(--text-muted)"} />
              )}
            </button>
          </div>
          <p style={{ textAlign: "center", fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "8px" }}>
            MenAI is an AI companion, not a substitute for professional help. In crisis, call 988.
          </p>
        </div>
      </div>
    </div>
  );
}
