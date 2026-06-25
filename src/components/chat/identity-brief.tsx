"use client";

import { useQuery } from "@tanstack/react-query";
import { ClayCard } from "@/components/ui";

/** Persistent identity summary — does not disappear when chat scrolls. */
export function IdentityBrief() {
  const { data, isLoading } = useQuery({
    queryKey: ["user-model-identity"],
    queryFn: async () => {
      const res = await fetch("/api/user-model");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  });

  const answer = data?.userModel?.whoAmIAnswer as string | undefined;
  const brief = answer?.trim();

  if (isLoading) {
    return (
      <ClayCard className="mx-4 mt-4 p-4" hover={false}>
        <div className="skeleton shimmer" style={{ height: 48, borderRadius: 8 }} />
      </ClayCard>
    );
  }

  if (!brief) return null;

  return (
    <ClayCard className="mx-4 mt-4 p-4 md:mx-6" hover={false}>
      <p className="clay-label mb-2">Who am I?</p>
      <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        {brief}
      </p>
    </ClayCard>
  );
}
