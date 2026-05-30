"use client";

import { useRef, useEffect, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChatMessage } from "@/components/chat/chat-message";
import type { Message } from "@/lib/store";

interface VirtualMessageListProps {
  messages: Message[];
  streamingContent?: string;
  isSending?: boolean;
  hasMoreOlder?: boolean;
  loadingOlder?: boolean;
  onLoadOlder?: () => void;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
}

export function VirtualMessageList({
  messages,
  streamingContent,
  isSending,
  hasMoreOlder,
  loadingOlder,
  onLoadOlder,
  scrollRef,
}: VirtualMessageListProps) {
  const internalRef = useRef<HTMLDivElement>(null);
  const parentRef = scrollRef ?? internalRef;
  const loadTriggeredRef = useRef(false);

  const extraRows =
    (streamingContent ? 1 : 0) + (isSending && !streamingContent ? 1 : 0);
  const totalCount = messages.length + extraRows;

  const virtualizer = useVirtualizer({
    count: totalCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 96,
    overscan: 10,
  });

  const handleScroll = useCallback(() => {
    const el = parentRef.current;
    if (!el) return;

    if (!hasMoreOlder || loadingOlder || !onLoadOlder) return;

    if (el.scrollTop < 120) {
      if (!loadTriggeredRef.current) {
        loadTriggeredRef.current = true;
        onLoadOlder();
      }
    } else {
      loadTriggeredRef.current = false;
    }
  }, [hasMoreOlder, loadingOlder, onLoadOlder, parentRef]);

  useEffect(() => {
    loadTriggeredRef.current = false;
  }, [loadingOlder, messages.length]);

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll, parentRef]);

  return (
    <>
      {hasMoreOlder && (
        <div className="chat-load-older">
          {loadingOlder ? "Loading earlier messages…" : "Scroll up for earlier messages"}
        </div>
      )}

      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const msg = messages[virtualRow.index];
          const isStreamingRow = virtualRow.index === messages.length && streamingContent;
          const isTypingRow =
            virtualRow.index === messages.length + (streamingContent ? 1 : 0) &&
            isSending &&
            !streamingContent;

          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {msg ? (
                <ChatMessage role={msg.role as "user" | "assistant"} content={msg.content} />
              ) : isStreamingRow ? (
                <div className="chat-streaming">
                  <div className="chat-bubble-ai">
                    <p style={{ margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.7, fontWeight: 300 }}>
                      {streamingContent}
                    </p>
                  </div>
                </div>
              ) : isTypingRow ? (
                <div className="chat-streaming">
                  <div className="chat-bubble-ai">
                    <div className="typing-indicator">
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );
}

export function scrollContainerToBottom(el: HTMLElement | null, smooth = false) {
  if (!el) return;
  el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
}
