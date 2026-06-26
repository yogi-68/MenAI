"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CoachKnowledgePanel } from "@/components/chat/coach-knowledge-panel";
import { MarkdownContent } from "@/components/chat/markdown-content";

interface CoachSnapshot {
  score: number;
  statusLabel: string;
  knows?: string[];
  lastMessage: { content: string; timeLabel: string } | null;
  earlierMessage: { content: string } | null;
}

export function CoachRail() {
  const { data, isLoading } = useQuery({
    queryKey: ["coach-snapshot"],
    queryFn: async () => {
      const res = await fetch("/api/coach/snapshot");
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<CoachSnapshot>;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const statusLabel = isLoading ? "Loading…" : data?.statusLabel ?? "Score —";

  return (
    <aside className="coach-rail" aria-label="Coach panel">
      <div className="coach-rail__header">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-base font-semibold" style={{ color: "var(--text-primary)" }}>
            Coach
          </h2>
          <Link
            href="/dashboard/chat"
            className="text-xs no-underline"
            style={{ color: "var(--accent-primary)" }}
          >
            Open chat
          </Link>
        </div>
        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
          {statusLabel}
        </p>
      </div>

      <div className="coach-rail__messages">
        {isLoading ? (
          <div className="skeleton shimmer" style={{ height: 80, borderRadius: 8 }} />
        ) : (
          <>
            {data?.lastMessage ? (
              <div className="coach-rail__bubble coach-rail__bubble--coach">
                <div className="coach-rail__time">{data.lastMessage.timeLabel}</div>
                <MarkdownContent content={data.lastMessage.content} className="chat-markdown chat-markdown--compact" />
              </div>
            ) : (
              <div className="coach-rail__bubble coach-rail__bubble--coach">
                <p style={{ color: "var(--text-secondary)" }}>
                  Your coach will appear here after your first conversation.
                </p>
              </div>
            )}
            {data?.earlierMessage && (
              <div className="coach-rail__bubble coach-rail__bubble--earlier">
                <MarkdownContent content={data.earlierMessage.content} className="chat-markdown chat-markdown--compact" />
              </div>
            )}
          </>
        )}
      </div>

      <div className="coach-rail__footer">
        <CoachKnowledgePanel variant="rail" bullets={data?.knows} />
      </div>
    </aside>
  );
}
