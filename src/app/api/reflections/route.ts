import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { invalidateUserCache } from "@/lib/ai/orchestrator/cache-invalidation";

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const date = new URL(req.url).searchParams.get("date") || new Date().toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("daily_reflections")
    .select("*")
    .eq("user_id", user.id)
    .eq("reflection_date", date)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reflection: data });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { movedForward, blockedBy, tomorrowContext, reflectionDate } = body;

  if (!movedForward?.trim() || !blockedBy?.trim() || !tomorrowContext?.trim()) {
    return NextResponse.json(
      { error: "All three reflection fields are required" },
      { status: 400 }
    );
  }

  const date = reflectionDate || new Date().toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("daily_reflections")
    .upsert(
      {
        user_id: user.id,
        reflection_date: date,
        moved_forward: movedForward.trim(),
        blocked_by: blockedBy.trim(),
        tomorrow_context: tomorrowContext.trim(),
      },
      { onConflict: "user_id,reflection_date" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  invalidateUserCache(user.id, "daily reflection saved");
  return NextResponse.json({ reflection: data }, { status: 201 });
}
