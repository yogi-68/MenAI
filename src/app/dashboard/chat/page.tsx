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
  const { 
    user,
    conversationStates,
    currentConversationId,
    crisisAlert,
    setMessages,
    addMessage,
    updateStreamingContent,
    setCurrentConversationId,
    setIsAiTyping,
    setCrisisAlert,
  } = useAppStore();
  
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const activeState = currentConversationId ? conversationStates[currentConversationId] : null;
  const messages = activeState?.messages || [];
  const streamingContent = activeState?.streamingContent || "";
  const isAiTyping = activeState?.isAiTyping || false;

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
    // Only load if we don't have it in state already (or to refresh)
    const res = await fetch(`/api/conversations/${convId}`);
    if (res.ok) {
      const data = await res.json();
      setMessages(convId, 
        (data.messages || []).map((m: Record<string, string>) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          created_at: m.created_at,
        }))
      );
      setCurrentConversationId(convId);
      setSidebarOpen(false);
    }
  }, [setMessages, setCurrentConversationId]);

  const startNewChat = () => {
    setCurrentConversationId(null);
    setInput("");
    setSidebarOpen(false);
  };

  const deleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this conversation? This cannot be undone.")) return;

    const res = await fetch(`/api/conversations/${convId}`, { method: "DELETE" });
    if (res.ok) {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      if (currentConversationId === convId) {
        startNewChat();
      }
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || isAiTyping) return;

    let targetConvId = currentConversationId;
    if (!targetConvId) {
      // If it's a new chat, generate a local ID for optimistic UI.
      // A real ID will be assigned by the server response header.
      targetConvId = crypto.randomUUID();
      setCurrentConversationId(targetConvId);
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
      created_at: new Date().toISOString(),
    };

    addMessage(targetConvId, userMessage);
    setInput("");
    setIsAiTyping(targetConvId, true);
    updateStreamingContent(targetConvId, "");

    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage.content,
          conversationId: currentConversationId,
        }),
      });

      if (!res.ok) {
        throw new Error("Chat request failed");
      }

      const serverConvId = res.headers.get("X-Conversation-Id");
      const isCrisis = res.headers.get("X-Crisis") === "true";

      if (isCrisis) {
        setCrisisAlert(true);
      }

      if (serverConvId && serverConvId !== targetConvId) {
        // Migration from optimistic ID to server ID
        setCurrentConversationId(serverConvId);
        setMessages(serverConvId, conversationStates[targetConvId]?.messages || []);
        targetConvId = serverConvId;
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
        updateStreamingContent(targetConvId, accumulated);
      }

      const aiMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: accumulated || "I'm here. What's on your mind?",
        created_at: new Date().toISOString(),
        crisis: isCrisis,
      };

      addMessage(targetConvId, aiMessage);
      updateStreamingContent(targetConvId, "");
      setIsAiTyping(targetConvId, false);
    } catch {
      // Fallback
      const fallbackContent = "There's something important in what you just shared. Let's unpack it — what does this mean for you right now?";
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: fallbackContent,
        created_at: new Date().toISOString(),
      };
      addMessage(targetConvId, errorMessage);
      updateStreamingContent(targetConvId, "");
      setIsAiTyping(targetConvId, false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div style={{ display: "flex", height: "100vh", position: "relative", width: "100%" }}>
      {/* Mobile sidebar toggle */}
      <button
        onClick={() => setSidebarOpen(true)}
        className="chat-sidebar-toggle"
        style={{
          position: "absolute",
          top: "16px",
          left: "16px",
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
          width: "280px",
          borderRight: "1px solid var(--border-color)",
          background: "var(--bg-secondary)",
          display: "flex",
          flexDirection: "column",
          padding: "24px 16px",
          overflowY: "auto",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
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
            New Thread
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

        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Threads
        </div>

        {conversations.map((conv: { id: string; title: string; updated_at: string }) => (
          <div
            key={conv.id}
            onClick={() => loadConversation(conv.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "12px 14px",
              borderRadius: "var(--radius-md)",
              cursor: "pointer",
              marginBottom: "6px",
              transition: "all 0.2s",
              background: currentConversationId === conv.id ? "rgba(255, 255, 255, 0.04)" : "transparent",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: "0.9rem",
                  fontWeight: currentConversationId === conv.id ? 500 : 400,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  color: currentConversationId === conv.id ? "var(--text-primary)" : "var(--text-secondary)",
                }}
              >
                {conv.title || "Untitled"}
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
                opacity: 0,
                transition: "all 0.2s",
                flexShrink: 0,
              }}
              className="delete-conv-btn"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}

        {conversations.length === 0 && (
          <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-muted)", fontSize: "0.9rem" }}>
            <MessageSquare size={24} style={{ opacity: 0.3, marginBottom: "12px" }} />
            <p>No threads yet.</p>
          </div>
        )}
      </div>

      {/* ===== CHAT AREA ===== */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Crisis Alert Banner */}
        {crisisAlert && (
          <div
            style={{
              padding: "12px 24px",
              background: "rgba(252, 92, 156, 0.1)",
              borderBottom: "1px solid rgba(252, 92, 156, 0.2)",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              animation: "slideDown 0.3s ease-out",
            }}
          >
            <AlertTriangle size={18} style={{ color: "var(--accent-tertiary)", flexShrink: 0 }} />
            <span style={{ fontSize: "0.9rem", color: "var(--accent-tertiary)" }}>
              If you're in crisis, please call <strong>988</strong> or text <strong>HELLO</strong> to <strong>741741</strong>
            </span>
            <a
              href="tel:988"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 16px",
                borderRadius: "var(--radius-full)",
                background: "rgba(252, 92, 156, 0.2)",
                color: "var(--accent-tertiary)",
                textDecoration: "none",
                fontSize: "0.85rem",
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
            padding: "32px",
            display: "flex",
            flexDirection: "column",
            gap: "24px",
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
              <h2 style={{ fontSize: "1.8rem", fontWeight: 400, letterSpacing: "-0.02em" }}>
                What is your <span className="gradient-text">focus</span> today?
              </h2>
              <p style={{ color: "var(--text-secondary)", maxWidth: "440px", lineHeight: 1.6, fontWeight: 300 }}>
                MenAI is an adaptive intelligence system. It learns your patterns and helps you maintain your trajectory. 
                Start by sharing what you want to achieve or what's currently blocking you.
              </p>
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", justifyContent: "center", marginTop: "16px" }}>
                {["Define my trajectory", "Review my active focus", "I am stuck"].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => {
                      setInput(suggestion);
                      inputRef.current?.focus();
                    }}
                    style={{
                      padding: "10px 20px",
                      borderRadius: "var(--radius-full)",
                      background: "var(--bg-glass)",
                      border: "1px solid var(--border-color)",
                      color: "var(--text-secondary)",
                      cursor: "pointer",
                      fontSize: "0.9rem",
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)" }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-secondary)" }}
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
                gap: "16px",
              }}
            >
              <div className={msg.role === "user" ? "chat-bubble-user" : "chat-bubble-ai"}>
                {msg.role === "assistant" ? (
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => <p style={{ margin: "0 0 12px", fontWeight: 300 }}>{children}</p>,
                      strong: ({ children }) => <strong style={{ color: "var(--text-primary)", fontWeight: 500 }}>{children}</strong>,
                      ul: ({ children }) => <ul style={{ paddingLeft: "20px", margin: "12px 0", fontWeight: 300 }}>{children}</ul>,
                      li: ({ children }) => <li style={{ marginBottom: "6px" }}>{children}</li>,
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                ) : (
                  <p style={{ margin: 0, fontWeight: 400 }}>{msg.content}</p>
                )}
              </div>
            </div>
          ))}

          {/* Streaming response */}
          {streamingContent && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
              <div className="chat-bubble-ai">
                <ReactMarkdown
                  components={{
                    p: ({ children }) => <p style={{ margin: "0 0 12px", fontWeight: 300 }}>{children}</p>,
                    strong: ({ children }) => <strong style={{ color: "var(--text-primary)", fontWeight: 500 }}>{children}</strong>,
                  }}
                >
                  {streamingContent}
                </ReactMarkdown>
              </div>
            </div>
          )}

          {/* Typing indicator */}
          {isAiTyping && !streamingContent && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
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
            padding: "24px",
            borderTop: "1px solid var(--border-color)",
            background: "var(--bg-primary)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: "16px",
              maxWidth: "800px",
              margin: "0 auto",
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="What are you focusing on?"
              rows={1}
              style={{
                flex: 1,
                background: "var(--bg-glass)",
                border: "1px solid var(--border-color)",
                borderRadius: "var(--radius-lg)",
                padding: "16px 20px",
                color: "var(--text-primary)",
                fontFamily: "var(--font-sans)",
                fontSize: "1rem",
                resize: "none",
                outline: "none",
                transition: "border-color 0.3s",
                lineHeight: 1.5,
                maxHeight: "150px",
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || isAiTyping}
              style={{
                width: 54,
                height: 54,
                borderRadius: "50%",
                background: input.trim() ? "var(--text-primary)" : "var(--bg-glass)",
                border: "none",
                cursor: input.trim() ? "pointer" : "not-allowed",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.3s",
                flexShrink: 0,
              }}
            >
              {isAiTyping ? (
                <Loader2 size={24} color="var(--bg-primary)" className="animate-spin" />
              ) : (
                <Send size={24} color={input.trim() ? "var(--bg-primary)" : "var(--text-muted)"} />
              )}
            </button>
          </div>
        </div>
      </div>

      <style jsx global>{`
        .chat-sidebar > div:hover .delete-conv-btn {
          opacity: 0.5 !important;
        }
        .delete-conv-btn:hover {
          opacity: 1 !important;
          color: var(--text-primary) !important;
        }

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
