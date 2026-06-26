"use client";

import ReactMarkdown from "react-markdown";

const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="chat-markdown__p">{children}</p>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="chat-markdown__strong">{children}</strong>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="chat-markdown__ul">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="chat-markdown__ol">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="chat-markdown__li">{children}</li>
  ),
};

interface MarkdownContentProps {
  content: string;
  className?: string;
}

/** Shared markdown renderer for coach chat and coach rail messages. */
export function MarkdownContent({ content, className = "chat-markdown" }: MarkdownContentProps) {
  return (
    <div className={className}>
      <ReactMarkdown components={markdownComponents}>{content}</ReactMarkdown>
    </div>
  );
}

interface PlainTextContentProps {
  content: string;
  className?: string;
}

/** User messages — preserve intentional line breaks without markdown. */
export function PlainTextContent({ content, className = "chat-plain-text" }: PlainTextContentProps) {
  return <p className={className}>{content}</p>;
}
