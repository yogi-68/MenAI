"use client";

import { useState, useRef, useEffect, useCallback, Suspense } from "react";
import { useAppStore, getChatStore, isRealConversationId, type Message } from "@/lib/store";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  VirtualMessageList,
  scrollContainerToBottom,
} from "@/components/chat/virtual-message-list";
import {
  ConversationNotFoundError,
  fetchLatestMessages,
  fetchOlderMessages,
  type MessagePage,
} from "@/lib/chat/fetch-messages";
import { CHAT_INITIAL_LIMIT } from "@/lib/chat/constants";
import { CoachKnowledgePanel } from "@/components/chat/coach-knowledge-panel";
import {
  Send,
  Loader2,
  AlertTriangle,
  Phone,
  MessageSquare,
  Trash2,
  Menu,
  X,
  RefreshCw,
} from "lucide-react";

type ConversationRow = {
  id: string;
  title: string;
  updated_at: string;
  message_count?: number;
};

type PaginationMeta = { hasMore: boolean; nextBefore: string | null };

const EMPTY_MESSAGES: Message[] = [];

function applyPagination(meta: Record<string, PaginationMeta>, convId: string, page: MessagePage) {
  meta[convId] = { hasMore: page.hasMore, nextBefore: page.nextBefore };
}

function ChatPageInner() {
  const searchParams = useSearchParams();
  const currentConversationId = useAppStore((s) => s.currentConversationId);
  const crisisAlert = useAppStore((s) => s.crisisAlert);
  const setCurrentConversationId = useAppStore((s) => s.setCurrentConversationId);
  const setCrisisAlert = useAppStore((s) => s.setCrisisAlert);
  const clearConversationState = useAppStore((s) => s.clearConversationState);
  const migrateConversation = useAppStore((s) => s.migrateConversation);
  const addOptimisticMessage = useAppStore((s) => s.addOptimisticMessage);
  const addMessage = useAppStore((s) => s.addMessage);
  const setMessages = useAppStore((s) => s.setMessages);
  const prependMessages = useAppStore((s) => s.prependMessages);

  const messages = useAppStore(
    useCallback(
      (s) =>
        currentConversationId
          ? s.conversationStates[currentConversationId]?.messages ?? EMPTY_MESSAGES
          : EMPTY_MESSAGES,
      [currentConversationId]
    )
  );

  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [retryText, setRetryText] = useState<string | null>(null);

  const intentGoalId = searchParams.get("goalId") ?? null;
  const intent = searchParams.get("intent") ?? null;
  const autoSentRef = useRef(false);

  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const paginationRef = useRef<Record<string, PaginationMeta>>({});
  const clearedStaleIdsRef = useRef<Set<string>>(new Set());
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastScrollTs = useRef(0);
  const skipScrollToBottomRef = useRef(false);

  // Auto-send opening message when intent=improve_confidence is in the URL
  useEffect(() => {
    if (intent !== "improve_confidence" || !intentGoalId || autoSentRef.current) return;
    if (isSending) return;
    autoSentRef.current = true;
    const openingMessage = `I want to improve my plan precision for this goal. What information do you need from me?`;
    sendMessage(openingMessage, { confidenceGoalId: intentGoalId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent, intentGoalId, isSending]);

  const handleMissingConversation = useCallback(
    (convId: string) => {
      clearConversationState(convId);
      delete paginationRef.current[convId];
      queryClient.removeQueries({ queryKey: ["messages", convId] });
      if (getChatStore().currentConversationId === convId) {
        setCurrentConversationId(null);
      }
    },
    [clearConversationState, queryClient, setCurrentConversationId]
  );

  const { data: conversations = [], isLoading: convsLoading } = useQuery({
    queryKey: ["conversations"],
    queryFn: async () => {
      const res = await fetch("/api/conversations");
      if (!res.ok) return [];
      const data = await res.json();
      return (data.conversations || []) as ConversationRow[];
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });



  const throttledScroll = useCallback(() => {
    const now = Date.now();
    if (now - lastScrollTs.current > 150) {
      lastScrollTs.current = now;
      scrollContainerToBottom(messagesScrollRef.current, false);
    }
  }, []);

  useEffect(() => {
    if (loadingOlder) return;
    if (skipScrollToBottomRef.current) {
      skipScrollToBottomRef.current = false;
      return;
    }
    scrollContainerToBottom(messagesScrollRef.current, true);
  }, [messages.length, streamingContent, isSending, loadingOlder]);

  const loadPageIntoStore = useCallback(
    (convId: string, page: MessagePage, mode: "replace" | "prepend") => {
      applyPagination(paginationRef.current, convId, page);
      if (mode === "replace") {
        setMessages(convId, page.messages);
      } else {
        prependMessages(convId, page.messages);
      }
      queryClient.setQueryData(["messages", convId], page.messages);
    },
    [prependMessages, queryClient, setMessages]
  );

  const syncFromServer = useCallback(async () => {
    const convId = getChatStore().currentConversationId;
    if (!isRealConversationId(convId)) return;
    try {
      const page = await fetchLatestMessages(convId);
      loadPageIntoStore(convId, page, "replace");
    } catch (error) {
      if (error instanceof ConversationNotFoundError) {
        handleMissingConversation(convId);
      }
    }
  }, [handleMissingConversation, loadPageIntoStore]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") syncFromServer();
    };
    window.addEventListener("focus", syncFromServer);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", syncFromServer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [syncFromServer]);

  const loadOlder = useCallback(async () => {
    const convId = getChatStore().currentConversationId;
    if (!isRealConversationId(convId) || loadingOlder) return;

    const meta = paginationRef.current[convId];
    if (!meta?.hasMore || !meta.nextBefore) return;

    const el = messagesScrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;

    setLoadingOlder(true);
    skipScrollToBottomRef.current = true;
    try {
      const page = await fetchOlderMessages(convId, meta.nextBefore);
      prependMessages(convId, page.messages);
      applyPagination(paginationRef.current, convId, page);

      requestAnimationFrame(() => {
        if (el) el.scrollTop += el.scrollHeight - prevHeight;
      });
    } catch (error) {
      if (error instanceof ConversationNotFoundError) {
        handleMissingConversation(convId);
      }
    } finally {
      setLoadingOlder(false);
    }
  }, [handleMissingConversation, loadingOlder, prependMessages]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  };

  const loadConversation = useCallback(
    async (convId: string) => {
      if (isSending) return;
      setCurrentConversationId(convId);
      setSidebarOpen(false);
      setStreamingContent("");
      setNetworkError(null);

      const cached = getChatStore().conversationStates[convId]?.messages;
      if (cached && cached.length > 0) {
        if (!paginationRef.current[convId]) {
          paginationRef.current[convId] = {
            hasMore: cached.length >= CHAT_INITIAL_LIMIT,
            nextBefore: cached[0]?.created_at ?? null,
          };
        }
        return;
      }

      try {
        const page = await queryClient.fetchQuery({
          queryKey: ["messages", convId],
          queryFn: () => fetchLatestMessages(convId),
          staleTime: 5 * 60_000,
        });
        loadPageIntoStore(convId, page, "replace");
      } catch (error) {
        if (error instanceof ConversationNotFoundError) {
          handleMissingConversation(convId);
          return;
        }
        console.error("Failed to load conversation:", error);
      }
    },
    [
      queryClient,
      setCurrentConversationId,
      loadPageIntoStore,
      isSending,
      handleMissingConversation,
    ]
  );

  const startNewChat = useCallback(() => {
    abortRef.current?.abort();
    setCurrentConversationId(null);
    setInput("");
    setStreamingContent("");
    setIsSending(false);
    setNetworkError(null);
    setRetryText(null);
    setSidebarOpen(false);
  }, [setCurrentConversationId]);

  const deleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this conversation? This cannot be undone.")) return;

    queryClient.setQueryData<ConversationRow[]>(["conversations"], (old) =>
      (old || []).filter((c) => c.id !== convId)
    );
    clearConversationState(convId);
    delete paginationRef.current[convId];
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
        {
          id: convId,
          title: title.slice(0, 50) || "New thread",
          updated_at: new Date().toISOString(),
        },
        ...rest,
      ];
    });
  };

  const recoverFromServer = async (convId: string) => {
    try {
      const page = await fetchLatestMessages(convId);
      loadPageIntoStore(convId, page, "replace");
    } catch (error) {
      if (error instanceof ConversationNotFoundError) {
        handleMissingConversation(convId);
      }
    }
  };

  const sendMessage = async (overrideText?: string, opts?: { confidenceGoalId?: string | null }) => {
    const messageText = (overrideText ?? input).trim();
    if (!messageText || isSending) return;

    setNetworkError(null);
    setRetryText(null);

    const convExists =
      isRealConversationId(currentConversationId) &&
      conversations.some((c) => c.id === currentConversationId);
    const isNewConversation = !convExists;
    const localConvId = isNewConversation ? `pending-${crypto.randomUUID()}` : currentConversationId!;

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
    scrollContainerToBottom(messagesScrollRef.current, true);

    if (inputRef.current) inputRef.current.style.height = "auto";

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let activeConvId = localConvId;
    let serverConvId: string | null = null;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: messageText,
          conversationId: convExists ? currentConversationId : null,
          ...(opts?.confidenceGoalId ? { confidenceGoalId: opts.confidenceGoalId } : {}),
        }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error("Chat request failed");

      serverConvId = res.headers.get("X-Conversation-Id");
      const isCrisis = res.headers.get("X-Crisis") === "true";
      if (isCrisis) setCrisisAlert(true);

      if (serverConvId && serverConvId !== localConvId) {
        migrateConversation(localConvId, serverConvId);
        activeConvId = serverConvId;
        upsertConversationInList(serverConvId, messageText);
        paginationRef.current[serverConvId] = paginationRef.current[localConvId] ?? {
          hasMore: false,
          nextBefore: null,
        };
      } else if (serverConvId) {
        upsertConversationInList(serverConvId, messageText);
        activeConvId = serverConvId;
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
        throttledScroll();
      }

      const aiMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: accumulated || "I'm here. What's blocking execution today?",
        created_at: new Date().toISOString(),
        crisis: isCrisis,
      };

      addMessage(activeConvId, aiMessage);
      setStreamingContent("");
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      console.error("Chat error:", error);

      setStreamingContent("");
      setNetworkError(
        "Connection interrupted. Your message may have been saved — tap retry or refresh."
      );
      setRetryText(messageText);

      if (serverConvId && isRealConversationId(serverConvId)) {
        await recoverFromServer(serverConvId);
      }
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
  const pagination =
    currentConversationId && isRealConversationId(currentConversationId)
      ? paginationRef.current[currentConversationId]
      : undefined;

  return (
    <div className="chat-layout">
      <button
        type="button"
        onClick={() => setSidebarOpen(true)}
        className="chat-sidebar-toggle"
        aria-label="Open threads"
      >
        <Menu size={20} />
      </button>

      {sidebarOpen && (
        <button
          type="button"
          className="chat-sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close threads"
        />
      )}

      <aside className={`chat-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="chat-sidebar-header">
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="chat-sidebar-close"
            aria-label="Close"
          >
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
        <div className="coach-knowledge-mobile-only">
          <CoachKnowledgePanel />
        </div>
        {crisisAlert && (
          <div className="chat-crisis-banner">
            <AlertTriangle size={18} />
            <span>
              If you&apos;re in crisis, please call <strong>988</strong> or text{" "}
              <strong>HELLO</strong> to <strong>741741</strong>
            </span>
            <a href="tel:988" className="chat-crisis-call">
              <Phone size={14} />
              Call 988
            </a>
          </div>
        )}

        {networkError && (
          <div className="chat-network-banner">
            <span>{networkError}</span>
            <button
              type="button"
              onClick={() => {
                if (retryText) sendMessage(retryText);
                else syncFromServer();
              }}
              disabled={isSending}
            >
              <RefreshCw size={14} />
              Retry
            </button>
          </div>
        )}

        <div className="chat-messages" ref={messagesScrollRef}>
          {showEmpty && (
            <div className="chat-empty">
              <h2>
                What is your <span className="gradient-text">focus</span> today?
              </h2>
              <p>
                Share what you&apos;re working on or what&apos;s blocking you. MenAI learns your
                patterns over time.
              </p>
              <div className="chat-suggestions">
                {["I want to build an AI SaaS", "Help me set a 90-day goal", "Who am I?"].map(
                  (suggestion) => (
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
                  )
                )}
              </div>
            </div>
          )}

          {!showEmpty && (
            <VirtualMessageList
              scrollRef={messagesScrollRef}
              messages={messages}
              streamingContent={streamingContent}
              isSending={isSending}
              hasMoreOlder={pagination?.hasMore}
              loadingOlder={loadingOlder}
              onLoadOlder={loadOlder}
            />
          )}
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
            <button
              type="button"
              onClick={() => sendMessage()}
              disabled={!input.trim() || isSending}
              className="chat-send-btn"
            >
              {isSending ? <Loader2 size={22} className="animate-spin" /> : <Send size={22} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={null}>
      <ChatPageInner />
    </Suspense>
  );
}
