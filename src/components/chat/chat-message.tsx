"use client";

import { memo } from "react";
import { MarkdownContent, PlainTextContent } from "@/components/chat/markdown-content";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
}

function ChatMessageInner({ role, content }: ChatMessageProps) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: role === "user" ? "flex-end" : "flex-start",
        alignItems: "flex-start",
        gap: "16px",
      }}
    >
      <div className={role === "user" ? "chat-bubble-user" : "chat-bubble-ai"}>
        {role === "assistant" ? (
          <MarkdownContent content={content} />
        ) : (
          <PlainTextContent content={content} />
        )}
      </div>
    </div>
  );
}

export const ChatMessage = memo(ChatMessageInner);
