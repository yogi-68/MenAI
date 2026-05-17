import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { storeMemory } from "@/lib/ai/orchestrator/memory-engine";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("mood_entries")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(90);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ entries: data });
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { mood_score, mood_label, emotions, note, activities, energy_level, sleep_hours } = body;

  if (!mood_score || mood_score < 1 || mood_score > 10) {
    return NextResponse.json({ error: "Invalid mood score" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("mood_entries")
    .insert({
      user_id: user.id,
      mood_score,
      mood_label: mood_label || "",
      emotions: emotions || [],
      note: note || "",
      activities: activities || [],
      energy_level: energy_level || null,
      sleep_hours: sleep_hours || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Store mood as memory for RAG retrieval (async, non-blocking)
  const emotionsText = emotions && emotions.length > 0 ? ` Emotions: ${emotions.join(", ")}.` : "";
  const noteText = note ? ` Note: ${note}` : "";
  storeMemory({
    userId: user.id,
    content: `Mood check-in: ${mood_label || "unlabeled"} (${mood_score}/10).${emotionsText}${noteText}`,
    memoryType: "mood",
    importance: mood_score <= 3 ? 0.9 : (mood_score >= 8 ? 0.7 : 0.6),
    metadata: { mood_id: data.id, mood_score, mood_label: mood_label || "" },
  }).catch((e) => console.error("Mood memory store error:", e));

  return NextResponse.json({ entry: data });
}
