import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildMemoryTimeline } from "@/lib/plans/memory-timeline";

export const runtime = "nodejs";

const CATEGORIES = [
  "initiative",
  "milestone",
  "completion",
  "execution",
  "reflection",
  "decision",
] as const;

type Range = "7d" | "30d" | "90d";

function parseRange(value: string | null): Range {
  if (value === "7d" || value === "30d" || value === "90d") return value;
  return "30d";
}

function rangeDays(range: Range): number {
  return range === "7d" ? 7 : range === "30d" ? 30 : 90;
}

function categoryLabel(cat: string): string {
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const range = parseRange(new URL(req.url).searchParams.get("range"));
  const days = rangeDays(range);
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceIso = since.toISOString();

  const events = await buildMemoryTimeline(supabase, user.id, 300);
  const filtered = events.filter((e) => e.sortKey >= sinceIso);

  const byCategory = CATEGORIES.map((cat) => ({
    label: categoryLabel(cat),
    category: cat,
    value: filtered.filter((e) => e.category === cat).length,
  })).filter((b) => b.value > 0);

  const byDay = new Map<string, number>();
  for (const e of filtered) {
    const day = e.sortKey.split("T")[0];
    byDay.set(day, (byDay.get(day) || 0) + 1);
  }

  const timeline = Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({
      date,
      label: new Date(date + "T12:00:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      value: count,
    }));

  const achievementCategories = new Set([
    "goal_created",
    "milestone",
    "achievement",
    "completion",
    "weekly_win",
    "monthly_win",
  ]);
  const eventsByMonth: Array<{ month: string; count: number; achievements: number }> = [];
  const monthMap = new Map<string, { count: number; achievements: number }>();
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthMap.set(key, { count: 0, achievements: 0 });
  }
  for (const e of events) {
    const monthKey = e.sortKey.slice(0, 7);
    if (!monthMap.has(monthKey)) continue;
    const row = monthMap.get(monthKey)!;
    row.count += 1;
    if (achievementCategories.has(e.category)) row.achievements += 1;
  }
  for (const [month, row] of monthMap.entries()) {
    eventsByMonth.push({
      month: new Date(month + "-01T12:00:00").toLocaleDateString("en-US", {
        month: "short",
      }),
      count: row.count,
      achievements: row.achievements,
    });
  }

  return NextResponse.json({
    range,
    total: filtered.length,
    byCategory,
    timeline,
    eventsByMonth,
    recent: filtered.slice(0, 12).map((e) => ({
      headline: e.headline,
      subline: e.subline,
      category: e.category,
      dayLabel: e.dayLabel,
      month: e.month,
    })),
  });
}
