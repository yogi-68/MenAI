"use client";

import { useQuery } from "@tanstack/react-query";
import { Flame } from "lucide-react";

export function SidebarStreak() {
  const { data, isLoading } = useQuery({
    queryKey: ["performance-daily"],
    queryFn: async () => {
      const res = await fetch("/api/analytics/performance?range=7d");
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ summary: { streak: number } }>;
    },
    staleTime: 45_000,
    refetchOnWindowFocus: true,
  });

  const streak = data?.summary?.streak ?? 0;

  return (
    <div className="sidebar-streak">
      <Flame size={14} style={{ color: "var(--accent-primary)", flexShrink: 0 }} />
      <span>
        {isLoading ? "—" : `${streak}-day streak`}
      </span>
    </div>
  );
}
