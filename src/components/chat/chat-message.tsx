"use client";

import { memo } from "react";
import ReactMarkdown from "react-markdown";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
}

const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p style={{ margin: "0 0 14px", fontWeight: 300, lineHeight: 1.8 }}>{children}</p>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong style={{ color: "var(--text-primary)", fontWeight: 500 }}>{children}</strong>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul style={{ paddingLeft: "22px", margin: "14px 0", fontWeight: 300, lineHeight: 1.8 }}>{children}</ul>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li style={{ marginBottom: "8px" }}>{children}</li>
  ),
};

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
          <ReactMarkdown components={markdownComponents}>{content}</ReactMarkdown>
        ) : (
          <p style={{ margin: 0, fontWeight: 400, lineHeight: 1.7 }}>{content}</p>
        )}
      </div>
    </div>
  );
}

export const ChatMessage = memo(ChatMessageInner);
