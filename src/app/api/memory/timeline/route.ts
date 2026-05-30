import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  buildMemoryTimeline,
  sortedTimelineMonths,
} from "@/lib/plans/memory-timeline";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const events = await buildMemoryTimeline(supabase, user.id);
  const monthOrder = sortedTimelineMonths(events);
  const byMonth = new Map<string, typeof events>();
  for (const e of events) {
    const list = byMonth.get(e.month) || [];
    list.push(e);
    byMonth.set(e.month, list);
  }

  const months = monthOrder.map((month) => ({
    month,
    events: (byMonth.get(month) || []).map((e) => ({
      headline: e.headline,
      subline: e.subline,
      category: e.category,
    })),
  }));

  return NextResponse.json({ months, total: events.length });
}
