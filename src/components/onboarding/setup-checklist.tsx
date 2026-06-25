"use client";

import Link from "next/link";
import { Target } from "lucide-react";
import { ClayCard } from "@/components/ui";

interface SetupChecklistProps {
  hasGoals?: boolean;
}

/** Shown when user has no active goal — daily plans require one with a deadline. */
export function SetupChecklist({ hasGoals = false }: SetupChecklistProps) {
  if (hasGoals) return null;

  return (
    <ClayCard className="p-6 mb-6" hover={false} style={{ borderLeft: "3px solid var(--accent-primary)" }}>
      <div className="flex items-start gap-3 mb-4">
        <Target size={20} style={{ color: "var(--accent-primary)", flexShrink: 0, marginTop: 2 }} />
        <div>
          <h2 className="text-base font-medium mb-2" style={{ color: "var(--text-primary)" }}>
            Add a goal to generate your daily plan
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
            MenAI plans from <strong style={{ color: "var(--text-secondary)" }}>goals → milestones → 3 tasks/day</strong>.
            Long-term direction alone is not enough — pick something finishable in 30–90 days.
          </p>
        </div>
      </div>
      <p className="text-sm mb-3" style={{ color: "var(--text-secondary)" }}>
        Examples:
      </p>
      <ul className="text-sm mb-5 pl-5 leading-relaxed" style={{ color: "var(--text-muted)" }}>
        <li>Launch an AI SaaS MVP by July</li>
        <li>Lose 5 kg by August</li>
        <li>Crack UPSC Prelims by September</li>
      </ul>
      <Link href="/dashboard/chat" className="btn-primary inline-block px-5 py-2.5 text-sm no-underline">
        Add a goal in Coach
      </Link>
    </ClayCard>
  );
}

/** @deprecated use hasGoals */
export type SetupChecklistLegacyProps = { hasInitiatives?: boolean };
