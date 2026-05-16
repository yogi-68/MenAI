import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getOpenAI } from "@/lib/ai/openai";
import { JOURNAL_INSIGHT_PROMPT } from "@/lib/ai/prompts";
import { storeMemory } from "@/lib/ai/memory";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("journal_entries")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

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
  const { title, content, tags } = body;

  if (!content || content.trim().length === 0) {
    return NextResponse.json({ error: "Content is required" }, { status: 400 });
  }

  // Generate AI insight
  let aiInsight = "";
  let sentimentScore = 0;
  let emotions: string[] = [];

  try {
    const insightResponse = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a supportive journal analyst. Provide brief, warm insights." },
        { role: "user", content: JOURNAL_INSIGHT_PROMPT + content },
      ],
      max_tokens: 200,
      temperature: 0.7,
    });
    aiInsight = insightResponse.choices[0]?.message?.content || "";

    // Quick sentiment analysis
    const sentimentResponse = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Respond only with a JSON object: {\"score\": <float -1 to 1>, \"emotions\": [<strings>]}" },
        { role: "user", content: `Analyze sentiment: "${content.slice(0, 500)}"` },
      ],
      max_tokens: 50,
      temperature: 0.3,
    });
    const parsed = JSON.parse(sentimentResponse.choices[0]?.message?.content || "{}");
    sentimentScore = parsed.score || 0;
    emotions = parsed.emotions || [];
  } catch (e) {
    console.error("Journal insight error:", e);
  }

  const { data, error } = await supabase
    .from("journal_entries")
    .insert({
      user_id: user.id,
      title: title || "Untitled Entry",
      content,
      ai_insight: aiInsight,
      sentiment_score: sentimentScore,
      emotions,
      tags: tags || [],
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Store journal as memory for RAG (async)
  storeMemory({
    userId: user.id,
    content: `Journal entry "${title || "Untitled"}": ${content.slice(0, 300)}. Emotions: ${emotions.join(", ")}`,
    memoryType: "journal",
    metadata: { journal_id: data.id, sentiment: sentimentScore },
  }).catch((e) => console.error("Journal memory store error:", e));

  return NextResponse.json({ entry: data });
}
