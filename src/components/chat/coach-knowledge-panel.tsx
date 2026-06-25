"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp } from "lucide-react";
import { ClayCard } from "@/components/ui";
import type { UserModel } from "@/lib/user-model/types";

/** Persistent coach memory — visible trust panel, not chat-only. */
export function CoachKnowledgePanel() {
  const [showEvidence, setShowEvidence] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["user-model-coach"],
    queryFn: async () => {
      const res = await fetch("/api/user-model");
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ userModel: UserModel }>;
    },
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  });

  const model = data?.userModel;
  const narrative = model?.whoAmIAnswer?.trim();
  const understands = model?.understands?.slice(0, 5) ?? [];
  const stillNeeds = model?.stillNeeds?.slice(0, 4) ?? [];
  const evidence = model?.evidence?.slice(0, 5) ?? [];
  const focusTitle = model?.currentFocus?.title;
  const milestone = model?.currentMilestone;

  if (isLoading) {
    return (
      <ClayCard className="mx-4 mt-4 p-4 md:mx-6" hover={false}>
        <div className="skeleton shimmer" style={{ height: 64, borderRadius: 6 }} />
      </ClayCard>
    );
  }

  if (!narrative && understands.length === 0 && !focusTitle) return null;

  return (
    <ClayCard className="mx-4 mt-4 p-4 md:mx-6" hover={false}>
      <p className="label mb-3">What your coach knows</p>

      {focusTitle && (
        <div className="mb-3 pb-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <p className="text-xs label mb-1">Current focus</p>
          <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            {focusTitle}
          </p>
          {milestone && (
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              Milestone: {milestone}
            </p>
          )}
        </div>
      )}

      {narrative && (
        <p className="text-sm leading-relaxed mb-3" style={{ color: "var(--text-secondary)" }}>
          {narrative}
        </p>
      )}

      {understands.length > 0 && (
        <ul className="text-sm space-y-1 mb-3" style={{ color: "var(--text-secondary)" }}>
          {understands.map((item) => (
            <li key={item}>· {item}</li>
          ))}
        </ul>
      )}

      {stillNeeds.length > 0 && (
        <div className="mb-2">
          <p className="label mb-1">Still learning</p>
          <ul className="text-sm space-y-1" style={{ color: "var(--text-muted)" }}>
            {stillNeeds.map((item) => (
              <li key={item}>· {item}</li>
            ))}
          </ul>
        </div>
      )}

      {evidence.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowEvidence((v) => !v)}
            className="flex items-center gap-1 text-xs label"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--text-muted)" }}
          >
            Evidence {showEvidence ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {showEvidence && (
            <ul className="text-xs mt-2 space-y-1" style={{ color: "var(--text-muted)" }}>
              {evidence.map((item) => (
                <li key={item}>· {item}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </ClayCard>
  );
}

/** @deprecated use CoachKnowledgePanel */
export const IdentityBrief = CoachKnowledgePanel;
