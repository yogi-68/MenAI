import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildMemoryTimeline, groupTimelineByMonth } from "@/lib/plans/memory-timeline";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const events = await buildMemoryTimeline(supabase, user.id);
  const grouped = groupTimelineByMonth(events);
  const months = Array.from(grouped.entries()).map(([month, items]) => ({ month, events: items }));

  return NextResponse.json({ months, total: events.length });
}
