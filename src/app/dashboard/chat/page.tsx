"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useAppStore, getChatStore, type Message } from "@/lib/store";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChatMessage } from "@/components/chat/chat-message";
import {
  Send,
  Loader2,
  Plus,
  AlertTriangle,
  Phone,
  MessageSquare,
  Trash2,
  Menu,
  X,
} from "lucide-react";

type ConversationRow = {
  id: string;
  title: string;
  updated_at: string;
  message_count?: number;
};

async function fetchMessages(convId: string): Promise<Message[]> {
  const res = await fetch(`/api/conversations/${convId}`);
  if (!res.ok) throw new Error("Failed to load messages");
  const data = await res.json();
  return (data.messages || []).map((m: Record<string, string>) => ({
    id: m.id,
    role: m.role as "user" | "assistant",
    content: m.content,
    created_at: m.created_at,
  }));
}

export default function ChatPage() {
  const currentConversationId = useAppStore((s) => s.currentConversationId);
  const crisisAlert = useAppStore((s) => s.crisisAlert);
  const setCurrentConversationId = useAppStore((s) => s.setCurrentConversationId);
  const setCrisisAlert = useAppStore((s) => s.setCrisisAlert);
  const clearConversationState = useAppStore((s) => s.clearConversationState);
  const migrateConversation = useAppStore((s) => s.migrateConversation);
  const addOptimisticMessage = useAppStore((s) => s.addOptimisticMessage);
  const addMessage = useAppStore((s) => s.addMessage);
  const setMessages = useAppStore((s) => s.setMessages);

  const messages = useAppStore(
    useCallback(
      (s) => (currentConversationId ? s.conversationStates[currentConversationId]?.messages ?? [] : []),
      [currentConversationId]
    )
  );

  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRaf = useRef<number | null>(null);

  const { data: conversations = [], isLoading: convsLoading } = useQuery({
    queryKey: ["conversations"],
    queryFn: async () => {
      const res = await fetch("/api/conversations");
      if (!res.ok) return [];
      const data = await res.json();
      return (data.conversations || []) as ConversationRow[];
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const scrollToBottom = useCallback((smooth = false) => {
    if (scrollRaf.current) cancelAnimationFrame(scrollRaf.current);
    scrollRaf.current = requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto" });
    });
  }, []);

  useEffect(() => {
    scrollToBottom(!streamingContent);
  }, [messages.length, streamingContent, scrollToBottom]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  };

  const loadConversation = useCallback(
    async (convId: string) => {
      setCurrentConversationId(convId);
      setSidebarOpen(false);
      setStreamingContent("");
      setIsSending(false);

      const cached = getChatStore().conversationStates[convId]?.messages;
      if (cached && cached.length > 0) return;

      try {
        const loaded = await queryClient.fetchQuery({
          queryKey: ["messages", convId],
          queryFn: () => fetchMessages(convId),
          staleTime: 5 * 60_000,
        });
        setMessages(convId, loaded);
      } catch (error) {
        console.error("Failed to load conversation:", error);
      }
    },
    [queryClient, setCurrentConversationId, setMessages]
  );

  const startNewChat = useCallback(() => {
    abortRef.current?.abort();
    setCurrentConversationId(null);
    setInput("");
    setStreamingContent("");
    setIsSending(false);
    setSidebarOpen(false);
  }, [setCurrentConversationId]);

  const deleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this conversation? This cannot be undone.")) return;

    queryClient.setQueryData<ConversationRow[]>(["conversations"], (old) =>
      (old || []).filter((c) => c.id !== convId)
    );
    clearConversationState(convId);
    queryClient.removeQueries({ queryKey: ["messages", convId] });

    if (currentConversationId === convId) startNewChat();

    try {
      const res = await fetch(`/api/conversations/${convId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
    } catch (error) {
      console.error("Failed to delete conversation:", error);
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      alert("Failed to delete conversation. Please try again.");
    }
  };

  const upsertConversationInList = (convId: string, title: string) => {
    queryClient.setQueryData<ConversationRow[]>(["conversations"], (old) => {
      const rest = (old || []).filter((c) => c.id !== convId);
      return [
        { id: convId, title: title.slice(0, 50) || "New thread", updated_at: new Date().toISOString() },
        ...rest,
      ];
    });
  };

  const sendMessage = async () => {
    if (!input.trim() || isSending) return;

    const messageText = input.trim();
    const isNewConversation = !currentConversationId;
    const localConvId = currentConversationId || `pending-${crypto.randomUUID()}`;

    if (isNewConversation) {
      setCurrentConversationId(localConvId);
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: messageText,
      created_at: new Date().toISOString(),
    };

    addOptimisticMessage(localConvId, userMessage);
    setInput("");
    setStreamingContent("");
    setIsSending(true);

    if (inputRef.current) inputRef.current.style.height = "auto";

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let activeConvId = localConvId;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: messageText,
          conversationId: isNewConversation ? null : currentConversationId,
        }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error("Chat request failed");

      const serverConvId = res.headers.get("X-Conversation-Id");
      const isCrisis = res.headers.get("X-Crisis") === "true";
      if (isCrisis) setCrisisAlert(true);

      if (serverConvId && serverConvId !== localConvId) {
        migrateConversation(localConvId, serverConvId);
        activeConvId = serverConvId;
        upsertConversationInList(serverConvId, messageText);
      } else if (serverConvId) {
        upsertConversationInList(serverConvId, messageText);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setStreamingContent(accumulated);
      }

      const aiMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: accumulated || "I'm here. What's on your mind?",
        created_at: new Date().toISOString(),
        crisis: isCrisis,
      };

      addMessage(activeConvId, aiMessage);
      setStreamingContent("");

      queryClient.setQueryData<Message[]>(["messages", activeConvId], (old) => [
        ...(old || []),
        userMessage,
        aiMessage,
      ]);
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      console.error("Chat error:", error);

      addMessage(activeConvId, {
        id: crypto.randomUUID(),
        role: "assistant",
        content:
          "There's something important in what you just shared. Let's unpack it — what does this mean for you right now?",
        created_at: new Date().toISOString(),
      });
      setStreamingContent("");
    } finally {
      setIsSending(false);
      abortRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const showEmpty = messages.length === 0 && !streamingContent && !isSending;

  const messageList = useMemo(
    () => messages.map((msg) => <ChatMessage key={msg.id} role={msg.role as "user" | "assistant"} content={msg.content} />),
    [messages]
  );

  return (
    <div className="chat-layout">
      <button type="button" onClick={() => setSidebarOpen(true)} className="chat-sidebar-toggle" aria-label="Open threads">
        <Menu size={20} />
      </button>

      {sidebarOpen && (
        <button type="button" className="chat-sidebar-overlay" onClick={() => setSidebarOpen(false)} aria-label="Close threads" />
      )}

      <aside className={`chat-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="chat-sidebar-header">
          <button type="button" onClick={startNewChat} className="chat-new-btn">
            <Plus size={18} />
            New Thread
          </button>
          <button type="button" onClick={() => setSidebarOpen(false)} className="chat-sidebar-close" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="chat-sidebar-label">Threads</div>

        {convsLoading && conversations.length === 0 ? (
          <div className="chat-sidebar-empty">Loading…</div>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              role="button"
              tabIndex={0}
              onClick={() => loadConversation(conv.id)}
              onKeyDown={(e) => e.key === "Enter" && loadConversation(conv.id)}
              className={`chat-thread-row ${currentConversationId === conv.id ? "active" : ""}`}
            >
              <span className="chat-thread-title">{conv.title || "Untitled"}</span>
              <button
                type="button"
                onClick={(e) => deleteConversation(conv.id, e)}
                title="Delete conversation"
                className="delete-conv-btn"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}

        {!convsLoading && conversations.length === 0 && (
          <div className="chat-sidebar-empty">
            <MessageSquare size={24} />
            <p>No threads yet.</p>
          </div>
        )}
      </aside>

      <div className="chat-main">
        {crisisAlert && (
          <div className="chat-crisis-banner">
            <AlertTriangle size={18} />
            <span>
              If you&apos;re in crisis, please call <strong>988</strong> or text <strong>HELLO</strong> to{" "}
              <strong>741741</strong>
            </span>
            <a href="tel:988" className="chat-crisis-call">
              <Phone size={14} />
              Call 988
            </a>
          </div>
        )}

        <div className="chat-messages">
          {showEmpty && (
            <div className="chat-empty">
              <h2>
                What is your <span className="gradient-text">focus</span> today?
              </h2>
              <p>
                MenAI learns your patterns and helps you maintain trajectory. Share what you want to achieve or
                what&apos;s blocking you.
              </p>
              <div className="chat-suggestions">
                {["Define my trajectory", "Review my active focus", "I am stuck"].map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => {
                      setInput(suggestion);
                      inputRef.current?.focus();
                    }}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messageList}

          {streamingContent && (
            <div className="chat-streaming">
              <div className="chat-bubble-ai">
                <p style={{ margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.7, fontWeight: 300 }}>
                  {streamingContent}
                </p>
              </div>
            </div>
          )}

          {isSending && !streamingContent && (
            <div className="chat-streaming">
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

        <div className="chat-input-area">
          <div className="chat-input-row">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="What are you focusing on?"
              rows={1}
              disabled={isSending}
            />
            <button type="button" onClick={sendMessage} disabled={!input.trim() || isSending} className="chat-send-btn">
              {isSending ? (
                <Loader2 size={22} className="animate-spin" />
              ) : (
                <Send size={22} />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
