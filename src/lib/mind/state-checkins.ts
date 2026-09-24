/**
 * Reading and writing daily state check-ins.
 *
 * One reading per day. Submitting twice updates the day's reading rather than
 * adding a second, so "how was today" always has a single answer.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { bandForScore, taskLoadForBand, type StateBand } from "./state-scale";

export type DayPhase = "morning" | "afternoon" | "evening" | "night";

export interface StateCheckin {
  id: string;
  checkinDate: string;
  score: number;
  band: StateBand;
  signals: string[];
  note: string | null;
  phase: DayPhase | null;
  createdAt: string;
}

interface StateCheckinRow {
  id: string;
  checkin_date: string;
  score: number;
  band: StateBand;
  signals: string[] | null;
  note: string | null;
  phase: DayPhase | null;
  created_at: string;
}

function toCheckin(row: StateCheckinRow): StateCheckin {
  return {
    id: row.id,
    checkinDate: row.checkin_date,
    score: row.score,
    band: row.band,
    signals: row.signals ?? [],
    note: row.note,
    phase: row.phase,
    createdAt: row.created_at,
  };
}

const SELECT = "id, checkin_date, score, band, signals, note, phase, created_at";

export function todayDateString(): string {
  return new Date().toISOString().split("T")[0];
}

/** Phase of day, used to spot time-of-day patterns. */
export function currentPhase(hour = new Date().getHours()): DayPhase {
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 22) return "evening";
  return "night";
}

export async function recordStateCheckin(
  supabase: SupabaseClient,
  userId: string,
  input: { score: number; signals?: string[]; note?: string | null; date?: string }
): Promise<StateCheckin | null> {
  const { data, error } = await supabase
    .from("state_checkins")
    .upsert(
      {
        user_id: userId,
        checkin_date: input.date ?? todayDateString(),
        score: input.score,
        band: bandForScore(input.score),
        signals: input.signals ?? [],
        note: input.note?.trim() || null,
        phase: currentPhase(),
      },
      { onConflict: "user_id,checkin_date" }
    )
    .select(SELECT)
    .single();

  if (error || !data) return null;
  return toCheckin(data as StateCheckinRow);
}

export async function getTodayCheckin(
  supabase: SupabaseClient,
  userId: string
): Promise<StateCheckin | null> {
  const { data } = await supabase
    .from("state_checkins")
    .select(SELECT)
    .eq("user_id", userId)
    .eq("checkin_date", todayDateString())
    .maybeSingle();

  return data ? toCheckin(data as StateCheckinRow) : null;
}

export async function getRecentCheckins(
  supabase: SupabaseClient,
  userId: string,
  days = 30
): Promise<StateCheckin[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data } = await supabase
    .from("state_checkins")
    .select(SELECT)
    .eq("user_id", userId)
    .gte("checkin_date", since.toISOString().split("T")[0])
    .order("checkin_date", { ascending: false })
    .limit(days);

  return (data ?? []).map((row) => toCheckin(row as StateCheckinRow));
}

export interface StateSummary {
  /** Today's reading, if there is one. */
  today: StateCheckin | null;
  /** Mean score over the window, rounded to one decimal. */
  average: number | null;
  /** Direction of travel against the first half of the window. */
  trend: "rising" | "falling" | "flat" | "unknown";
  /** Signals appearing most often, most frequent first. */
  commonSignals: Array<{ signal: string; count: number }>;
  /** How many of the last N days have a reading. */
  consistency: { logged: number; window: number };
  /** Task load appropriate to today's state, or the recent average. */
  suggestedTaskLoad: number;
}

/**
 * Summarize recent state for the coach and the planner.
 *
 * Needs at least four readings before it will call a trend — below that, the
 * noise in a self-report scale is larger than any signal, and a coach that
 * announces a downturn from two data points loses credibility fast.
 */
export function summarizeState(checkins: StateCheckin[], window = 14): StateSummary {
  const recent = checkins.slice(0, window);
  const today = recent.find((c) => c.checkinDate === todayDateString()) ?? null;

  if (recent.length === 0) {
    return {
      today: null,
      average: null,
      trend: "unknown",
      commonSignals: [],
      consistency: { logged: 0, window },
      suggestedTaskLoad: taskLoadForBand("steady"),
    };
  }

  const average =
    Math.round((recent.reduce((sum, c) => sum + c.score, 0) / recent.length) * 10) / 10;

  let trend: StateSummary["trend"] = "unknown";
  if (recent.length >= 4) {
    const half = Math.floor(recent.length / 2);
    // `recent` is newest-first, so the first half is the more recent one.
    const newer = recent.slice(0, half);
    const older = recent.slice(half);
    const mean = (list: StateCheckin[]) => list.reduce((s, c) => s + c.score, 0) / list.length;
    const delta = mean(newer) - mean(older);
    trend = delta > 0.75 ? "rising" : delta < -0.75 ? "falling" : "flat";
  }

  const counts = new Map<string, number>();
  for (const checkin of recent) {
    for (const signal of checkin.signals) {
      counts.set(signal, (counts.get(signal) ?? 0) + 1);
    }
  }
  const commonSignals = [...counts.entries()]
    .map(([signal, count]) => ({ signal, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const band = today ? today.band : bandForScore(Math.round(average));

  return {
    today,
    average,
    trend,
    commonSignals,
    consistency: { logged: recent.length, window },
    suggestedTaskLoad: taskLoadForBand(band),
  };
}

/** One line of state context for a prompt. Empty when there is nothing to say. */
export function formatStateForPrompt(summary: StateSummary): string {
  if (!summary.average) return "";

  const parts: string[] = [];
  if (summary.today) {
    parts.push(`Today: ${summary.today.score}/10`);
    if (summary.today.signals.length > 0) {
      parts.push(`feeling ${summary.today.signals.join(", ").toLowerCase()}`);
    }
  }
  parts.push(`${summary.consistency.window}-day average ${summary.average}/10`);
  if (summary.trend !== "unknown" && summary.trend !== "flat") parts.push(summary.trend);
  if (summary.commonSignals.length > 0) {
    parts.push(`recurring: ${summary.commonSignals.map((s) => s.signal).join(", ").toLowerCase()}`);
  }

  return `MENTAL STATE — ${parts.join(" · ")}`;
}
