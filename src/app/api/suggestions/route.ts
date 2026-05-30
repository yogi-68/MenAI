import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { assertCanActivateInitiative } from "@/lib/ai/memory-confidence";
import { invalidateTodayPlan } from "@/lib/plans/daily-plan-generator";
import { invalidateUserCache } from "@/lib/ai/orchestrator/cache-invalidation";
import { generateMilestonesForInitiative } from "@/lib/plans/milestone-generator";
import { trackProductEvent } from "@/lib/analytics/track-event";
import { scheduleUserModelRefresh } from "@/lib/user-model/synthesis-engine";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("ai_suggestions")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ suggestions: data || [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, action, edits } = body as {
    id: string;
    action: "accept" | "dismiss";
    edits?: { title?: string; targetDate?: string; lifeArea?: string };
  };

  if (!id || !action) {
    return NextResponse.json({ error: "id and action required" }, { status: 400 });
  }

  const { data: suggestion, error: fetchErr } = await supabase
    .from("ai_suggestions")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("status", "pending")
    .single();

  if (fetchErr || !suggestion) {
    return NextResponse.json({ error: "Suggestion not found" }, { status: 404 });
  }

  if (action === "dismiss") {
    await supabase
      .from("ai_suggestions")
      .update({ status: "dismissed", resolved_at: new Date().toISOString() })
      .eq("id", id);
    trackProductEvent(user.id, "suggestion_dismissed", {
      type: suggestion.suggestion_type,
      title: suggestion.title,
    }).catch(() => {});
    scheduleUserModelRefresh(supabase, user.id);
    return NextResponse.json({ success: true });
  }

  const payload = suggestion.payload as Record<string, string>;
  const title = (edits?.title || suggestion.title).trim();

  if (suggestion.suggestion_type === "initiative") {
    const gate = await assertCanActivateInitiative(supabase, user.id);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: 409 });

    const targetDate =
      edits?.targetDate ||
      payload.targetDate ||
      defaultDeadline(30);

    const { data: created, error: insErr } = await supabase.from("initiatives").insert({
      user_id: user.id,
      title,
      description: payload.description || null,
      target_date: targetDate,
      life_area: edits?.lifeArea || payload.lifeArea || "personal",
      status: "active",
    }).select("id, title, description").single();

    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

    if (created) {
      await generateMilestonesForInitiative(
        supabase,
        user.id,
        created.id,
        created.title,
        created.description,
        edits?.lifeArea || payload.lifeArea || "personal"
      );
    }
    await invalidateTodayPlan(supabase, user.id);
    invalidateUserCache(user.id, "initiative accepted from suggestion");
  }

  if (suggestion.suggestion_type === "opportunity") {
    const { error: insErr } = await supabase.from("opportunities").insert({
      user_id: user.id,
      title,
      description: payload.description || null,
      due_date: edits?.targetDate || payload.dueDate || null,
      urgency: payload.urgency || "medium",
      life_area: edits?.lifeArea || payload.lifeArea || "personal",
      status: "active",
    });
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  if (suggestion.suggestion_type === "direction") {
    const { error: insErr } = await supabase.from("goals").insert({
      user_id: user.id,
      title,
      description: payload.description || null,
      category: payload.category || "personal",
      priority: payload.priority || "medium",
      source: "chat_suggestion",
    });
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  await supabase
    .from("ai_suggestions")
    .update({ status: "accepted", resolved_at: new Date().toISOString() })
    .eq("id", id);

  trackProductEvent(user.id, "suggestion_accepted", {
    type: suggestion.suggestion_type,
    title: suggestion.title,
  }).catch(() => {});
  scheduleUserModelRefresh(supabase, user.id);

  return NextResponse.json({ success: true });
}

function defaultDeadline(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}
