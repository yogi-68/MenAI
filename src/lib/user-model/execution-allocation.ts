import { detectDomain, type CoachDomain } from "@/lib/plans/coach-insights";
import {
  computeInitiativeHealth,
  type InitiativeHealth,
} from "@/lib/plans/initiative-health";
import type { InitiativeRow } from "@/lib/user-model/types";

export type AllocationRole = "focus" | "secondary" | "maintenance";

export interface ExecutionAllocationEntry {
  initiativeId: string;
  title: string;
  lifeArea: string | null;
  domain: CoachDomain;
  percent: number;
  role: AllocationRole;
  rationale: string;
}

export interface ActivePortfolioEntry {
  initiativeId: string;
  title: string;
  lifeArea: string | null;
  domain: CoachDomain;
  health: InitiativeHealth;
  healthLabel: string;
  targetDate: string | null;
  isFocus: boolean;
}

function daysUntil(dateStr: string, now = new Date()): number {
  const target = new Date(dateStr);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function daysSince(dateStr: string, now = new Date()): number {
  const past = new Date(dateStr);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  past.setHours(0, 0, 0, 0);
  return Math.ceil((today.getTime() - past.getTime()) / (1000 * 60 * 60 * 24));
}

function computeRawWeight(
  init: InitiativeRow,
  isFocus: boolean,
  now: Date
): { weight: number; factors: string[] } {
  let weight = 15;
  const factors: string[] = [];

  if (isFocus) {
    weight += 45;
    factors.push("current focus");
  }

  const health = computeInitiativeHealth({
    status: init.status,
    targetDate: init.target_date,
    lastActionAt: init.last_action_at,
    progress: init.progress ?? undefined,
  });

  if (health.health === "stalled") {
    weight += 30;
    factors.push("neglected — needs attention");
  } else if (health.health === "at_risk") {
    weight += 20;
    factors.push("at risk");
  }

  if (init.target_date) {
    const days = daysUntil(init.target_date, now);
    if (days <= 7) {
      weight += 25;
      factors.push("deadline within 7 days");
    } else if (days <= 14) {
      weight += 18;
      factors.push("deadline within 2 weeks");
    } else if (days <= 30) {
      weight += 10;
      factors.push("deadline within 30 days");
    }
  }

  if (init.last_action_at) {
    const since = daysSince(init.last_action_at, now);
    if (since >= 10 && !isFocus) {
      weight += 15;
      factors.push(`no action in ${since} days`);
    }
  } else if (!isFocus) {
    weight += 10;
    factors.push("never acted on");
  }

  if (init.progress != null && init.progress < 30 && init.target_date) {
    weight += 5;
  }

  return { weight, factors };
}

function normalizePercents(
  entries: Array<{ weight: number; isFocus: boolean }>,
  focusId: string | null
): number[] {
  const total = entries.reduce((s, e) => s + e.weight, 0);
  if (total === 0) return entries.map(() => Math.floor(100 / entries.length));

  let percents = entries.map((e) => Math.round((e.weight / total) * 100));

  let sum = percents.reduce((s, p) => s + p, 0);
  if (percents.length > 0 && sum !== 100) {
    percents[0] += 100 - sum;
  }

  if (entries.length >= 2 && focusId) {
    const actualFocusIdx = entries.findIndex((e) => e.isFocus);
    if (actualFocusIdx >= 0 && percents[actualFocusIdx] < 50) {
      const deficit = 50 - percents[actualFocusIdx];
      percents[actualFocusIdx] = 50;
      const others = percents.filter((_, i) => i !== actualFocusIdx);
      const otherSum = others.reduce((s, p) => s + p, 0);
      if (otherSum > 0) {
        for (let i = 0; i < percents.length; i++) {
          if (i !== actualFocusIdx) {
            percents[i] = Math.max(5, Math.round(percents[i] - (deficit * percents[i]) / otherSum));
          }
        }
      }
      sum = percents.reduce((s, p) => s + p, 0);
      if (sum !== 100) percents[actualFocusIdx] += 100 - sum;
    }
  }

  return percents;
}

export function computeExecutionAllocation(
  initiatives: InitiativeRow[],
  focusInitiativeId: string | null,
  options?: { maxEntries?: number; now?: Date }
): { allocation: ExecutionAllocationEntry[]; portfolio: ActivePortfolioEntry[] } {
  const maxEntries = options?.maxEntries ?? 4;
  const now = options?.now ?? new Date();
  const active = initiatives.filter((i) => i.status === "active");

  const focusId =
    focusInitiativeId && active.some((i) => i.id === focusInitiativeId)
      ? focusInitiativeId
      : active[0]?.id ?? null;

  const weighted = active.map((init) => {
    const isFocus = init.id === focusId;
    const { weight, factors } = computeRawWeight(init, isFocus, now);
    const domain = detectDomain(`${init.title} ${init.description || ""}`, init.life_area);
    const health = computeInitiativeHealth({
      status: init.status,
      targetDate: init.target_date,
      lastActionAt: init.last_action_at,
      progress: init.progress ?? undefined,
    });
    return { init, weight, factors, domain, isFocus, health };
  });

  const sorted = [...weighted].sort((a, b) => b.weight - a.weight);
  const included = sorted.slice(0, maxEntries);
  const percents = normalizePercents(
    included.map((x) => ({ weight: x.weight, isFocus: x.isFocus })),
    focusId
  );

  const allocation: ExecutionAllocationEntry[] = included.map((p, idx) => ({
    initiativeId: p.init.id,
    title: p.init.title,
    lifeArea: p.init.life_area,
    domain: p.domain,
    percent: percents[idx] ?? 0,
    role: p.isFocus ? "focus" : (percents[idx] ?? 0) >= 15 ? "secondary" : "maintenance",
    rationale: p.factors.length > 0 ? p.factors.join("; ") : "active pursuit",
  }));

  const portfolio: ActivePortfolioEntry[] = active.map((init) => {
    const isFocus = init.id === focusId;
    const health = computeInitiativeHealth({
      status: init.status,
      targetDate: init.target_date,
      lastActionAt: init.last_action_at,
      progress: init.progress ?? undefined,
    });
    return {
      initiativeId: init.id,
      title: init.title,
      lifeArea: init.life_area,
      domain: detectDomain(`${init.title} ${init.description || ""}`, init.life_area),
      health: health.health,
      healthLabel: health.label,
      targetDate: init.target_date,
      isFocus,
    };
  });

  return { allocation, portfolio };
}

export function formatExecutionAllocationForPrompt(
  allocation: ExecutionAllocationEntry[],
  availableMinutes: number
): string[] {
  return allocation.map((a) => {
    const minutes = Math.round((availableMinutes * a.percent) / 100);
    return `[${a.role.toUpperCase()} — ${a.percent}% ≈ ${minutes}min] ${a.title} (${a.domain}): ${a.rationale}`;
  });
}
