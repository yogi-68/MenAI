"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAppStore } from "@/lib/store";
import { formatTime } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  Menu,
  X,
} from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  crisis?: boolean;
}

export default function ChatPage() {
  const { user } = useAppStore();
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [crisisAlert, setCrisisAlert] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { data: conversations = [] } = useQuery({
    queryKey: ["conversations"],
    queryFn: async () => {
      const res = await fetch("/api/conversations");
      if (!res.ok) return [];
      const data = await res.json();
      return data.conversations || [];
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  };

  const loadConversation = useCallback(async (convId: string) => {
    const res = await fetch(`/api/conversations/${convId}`);
    if (res.ok) {
      const data = await res.json();
      setMessages(
        (data.messages || []).map((m: Record<string, string>) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          created_at: m.created_at,
        }))
      );
      setConversationId(convId);
      setSidebarOpen(false);
    }
  }, []);

  const startNewChat = () => {
    setMessages([]);
    setConversationId(null);
    setCrisisAlert(false);
    setStreamingContent("");
    setInput("");
    setSidebarOpen(false);
  };

  const deleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this conversation? This cannot be undone.")) return;

    const res = await fetch(`/api/conversations/${convId}`, { method: "DELETE" });
    if (res.ok) {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      if (conversationId === convId) {
        startNewChat();
      }
    }
  };

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
    setStreamingContent("");

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

      if (!res.ok) {
        throw new Error("Chat request failed");
      }

      const newConvId = res.headers.get("X-Conversation-Id");
      const isCrisis = res.headers.get("X-Crisis") === "true";

      if (isCrisis) {
        setCrisisAlert(true);
      }

      if (newConvId && !conversationId) {
        setConversationId(newConvId);
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        accumulated += text;
        setStreamingContent(accumulated);
      }

      const aiMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: accumulated || "I'm here. What's on your mind?",
        created_at: new Date().toISOString(),
        crisis: isCrisis,
      };

      setMessages((prev) => [...prev, aiMessage]);
      setStreamingContent("");
    } catch {
      // Context-aware fallback — NEVER expose internal errors
      const lastUserMsg = input.trim().toLowerCase();
      let fallbackContent = "There's something important in what you just shared. Let's unpack it — what does this mean for you right now?";

      // Generate context-sensitive fallback based on what user said
      if (/plan my (day|week)/i.test(lastUserMsg)) {
        fallbackContent = "I'd love to help you plan. What are the main things you want to move forward today?";
      } else if (/i (want|need) to (build|create|start|launch)/i.test(lastUserMsg)) {
        fallbackContent = "That sounds like something that's been sitting seriously on your mind. Are you still exploring ideas, or do you already have something specific you want to build?";
      } else if (/i('m| am) (stuck|lost|confused)/i.test(lastUserMsg)) {
        fallbackContent = "Being stuck usually means you're at the edge of something new. What's the thing that feels most unclear right now?";
      } else if (/i('m| am) (tired|exhausted|burned out)/i.test(lastUserMsg)) {
        fallbackContent = "That kind of tiredness isn't just physical. What's been draining you the most?";
      }

      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: fallbackContent,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
      setStreamingContent("");
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
    <div style={{ display: "flex", height: "100vh", position: "relative" }}>
      {/* Mobile sidebar toggle */}
      <button
        onClick={() => setSidebarOpen(true)}
        className="chat-sidebar-toggle"
        style={{
          position: "absolute",
          top: "12px",
          left: "12px",
          zIndex: 20,
          background: "var(--bg-glass)",
          border: "1px solid var(--border-color)",
          borderRadius: "var(--radius-md)",
          padding: "8px",
          cursor: "pointer",
          color: "var(--text-secondary)",
          display: "none",
        }}
      >
        <Menu size={20} />
      </button>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="chat-sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 25,
            display: "none",
          }}
        />
      )}

      {/* ===== CONVERSATION SIDEBAR ===== */}
      <div
        className="chat-sidebar"
        style={{
          width: "260px",
          borderRight: "1px solid var(--border-color)",
          background: "var(--bg-secondary)",
          display: "flex",
          flexDirection: "column",
          padding: "16px",
          overflowY: "auto",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <button
            onClick={startNewChat}
            style={{
              flex: 1,
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
              transition: "all 0.2s",
            }}
          >
            <Plus size={18} />
            New Conversation
          </button>
          <button
            onClick={() => setSidebarOpen(false)}
            className="chat-sidebar-close"
            style={{
              display: "none",
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: "8px",
              marginLeft: "8px",
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          Recent Chats
        </div>

        {conversations.map((conv: { id: string; title: string; updated_at: string }) => (
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
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
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
          {messages.length === 0 && !streamingContent && (
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
                I&apos;m your AI mentor, execution coach, and accountability partner. Talk to me about
                your goals, what&apos;s blocking you, or what you want to build next.
              </p>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center", marginTop: "8px" }}>
                {["Plan my day", "Review my goals", "I need clarity", "Focus reset"].map((suggestion) => (
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

          {/* Streaming response */}
          {streamingContent && (
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
                <ReactMarkdown
                  components={{
                    p: ({ children }) => <p style={{ margin: "0 0 8px", lineHeight: 1.7, fontSize: "0.95rem" }}>{children}</p>,
                    strong: ({ children }) => <strong style={{ color: "var(--accent-primary)", fontWeight: 600 }}>{children}</strong>,
                  }}
                >
                  {streamingContent}
                </ReactMarkdown>
              </div>
            </div>
          )}

          {/* Typing indicator (pre-stream) */}
          {loading && !streamingContent && (
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
              placeholder="What's on your mind? Goals, blockers, ideas..."
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

      <style jsx global>{`
        @media (max-width: 768px) {
          .chat-sidebar-toggle { display: block !important; }
          .chat-sidebar-overlay { display: block !important; }
          .chat-sidebar-close { display: block !important; }
          .chat-sidebar {
            position: fixed !important;
            left: 0; top: 0; bottom: 0;
            z-index: 30;
            transform: ${sidebarOpen ? "translateX(0)" : "translateX(-100%)"};
            transition: transform 0.3s ease;
          }
        }
      `}</style>
    </div>
  );
}
