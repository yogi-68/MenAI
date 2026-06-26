"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp } from "lucide-react";
import { ClayCard } from "@/components/ui";
import { ExecutionProfileRadar } from "@/components/charts/execution-profile-radar";
import type { UserModel } from "@/lib/user-model/types";
import type { ExecutionProfileScores } from "@/lib/user-model/execution-profile-scores";
import { isUserModelStale } from "@/lib/user-model/staleness";
import { formatKnowledgeBulletsForRail } from "@/lib/plans/task-why-line";

interface CoachKnowledgePanelProps {
  variant?: "page" | "rail";
  bullets?: string[];
}

function trimBullet(text: string, maxWords = 8): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text.trim();
  return words.slice(0, maxWords).join(" ");
}

function isCompleteBullet(text: string): boolean {
  const t = text.trim();
  if (t.endsWith("…") || t.endsWith("...")) return false;
  if (/\.\.\.$/.test(t)) return false;
  return t.length >= 4;
}

/** Persistent coach memory — visible trust panel, not chat-only. */
export function CoachKnowledgePanel({ variant = "page", bullets }: CoachKnowledgePanelProps) {
  const [showEvidence, setShowEvidence] = useState(false);
  const isRail = variant === "rail";

  const { data, isLoading } = useQuery({
    queryKey: ["user-model-coach"],
    queryFn: async () => {
      const res = await fetch("/api/user-model");
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{
        userModel: UserModel;
        updatedAt: string | null;
        executionProfile?: ExecutionProfileScores;
      }>;
    },
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    enabled: !isRail || !bullets?.length,
  });

  const model = data?.userModel;
  const stale = isUserModelStale(data?.updatedAt, model?.synthesizedAt);
  const rawUnderstands = model?.understands?.slice(0, isRail ? 6 : 5) ?? [];

  const railBullets =
    bullets && bullets.length > 0
      ? bullets
      : model?.knowledgeBullets?.length
        ? model.knowledgeBullets
        : formatKnowledgeBulletsForRail(
            rawUnderstands.length > 0 ? rawUnderstands : model?.identity.labels ?? []
          );

  const understands = (isRail ? railBullets : rawUnderstands)
    .map((item) => trimBullet(item))
    .filter((item) => !stale || isCompleteBullet(item));

  const stillNeeds = model?.stillNeeds?.slice(0, 4) ?? [];
  const evidence = model?.evidence?.slice(0, 5) ?? [];
  const focusTitle = model?.currentFocus?.title;
  const milestone = model?.currentMilestone;
  const profileScores = data?.executionProfile;

  if (isLoading && !bullets?.length) {
    if (isRail) {
      return <div className="skeleton shimmer" style={{ height: 64, borderRadius: 6 }} />;
    }
    return (
      <ClayCard className="mx-4 mt-4 p-4 md:mx-6" hover={false}>
        <div className="skeleton shimmer" style={{ height: 64, borderRadius: 6 }} />
      </ClayCard>
    );
  }

  if (isRail && understands.length === 0) return null;
  if (!isRail && understands.length === 0 && !focusTitle && !profileScores) return null;

  const content = (
    <>
      <div className="label mb-3 flex items-center gap-2 flex-wrap">
        <span>What your coach knows</span>
        {stale && (
          <span
            className="text-[10px] font-normal normal-case px-1.5 py-0.5 rounded"
            style={{ color: "var(--text-muted)", background: "var(--bg-glass)", border: "0.5px solid var(--border-subtle)" }}
          >
            updating…
          </span>
        )}
      </div>

      {isRail ? (
        <ul className="text-xs space-y-2 m-0 pl-0 list-none" style={{ color: "var(--text-secondary)", lineHeight: 1.5 }}>
          {understands.map((item) => (
            <li key={item}>· {item}</li>
          ))}
        </ul>
      ) : (
        <>
          {focusTitle && (
            <ul className="text-sm space-y-1 mb-3 m-0 pl-4" style={{ color: "var(--text-secondary)" }}>
              <li>Focus: {focusTitle}</li>
              {milestone && <li>Milestone: {milestone}</li>}
            </ul>
          )}

          {understands.length > 0 && (
            <ul className="text-sm space-y-1 mb-3 m-0 pl-4" style={{ color: "var(--text-secondary)" }}>
              {understands.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}

          {profileScores && (
            <div className="mb-4">
              <p className="label mb-2">Your execution profile</p>
              <ExecutionProfileRadar scores={profileScores} />
            </div>
          )}

          {stillNeeds.length > 0 && (
            <div className="mb-2">
              <p className="label mb-1">Still learning</p>
              <ul className="text-sm space-y-1 m-0 pl-4" style={{ color: "var(--text-muted)" }}>
                {stillNeeds.map((item) => (
                  <li key={item}>{item}</li>
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
                <ul className="text-xs mt-2 space-y-1 m-0 pl-4" style={{ color: "var(--text-muted)" }}>
                  {evidence.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </>
  );

  if (isRail) return content;

  return (
    <ClayCard className="mx-4 mt-4 p-4 md:mx-6" hover={false}>
      {content}
    </ClayCard>
  );
}

/** @deprecated use CoachKnowledgePanel */
export const IdentityBrief = CoachKnowledgePanel;
