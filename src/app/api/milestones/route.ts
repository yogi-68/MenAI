import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { invalidateTodayPlan } from "@/lib/plans/daily-plan-generator";

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const initiativeId = new URL(req.url).searchParams.get("initiativeId");

  let query = supabase
    .from("initiative_milestones")
    .select("*")
    .eq("user_id", user.id)
    .order("sort_order", { ascending: true });

  if (initiativeId) query = query.eq("initiative_id", initiativeId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ milestones: data || [] });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, status } = body as { id: string; status: "pending" | "in_progress" | "completed" };

  if (!id || !status) {
    return NextResponse.json({ error: "id and status required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { status };
  if (status === "completed") updates.completed_at = new Date().toISOString();

  const { data: milestone, error } = await supabase
    .from("initiative_milestones")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("initiative_id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (status === "completed" && milestone?.initiative_id) {
    const { data: siblings } = await supabase
      .from("initiative_milestones")
      .select("id, sort_order")
      .eq("initiative_id", milestone.initiative_id)
      .eq("status", "pending")
      .order("sort_order", { ascending: true })
      .limit(1);

    if (siblings?.[0]) {
      await supabase
        .from("initiative_milestones")
        .update({ status: "in_progress" })
        .eq("id", siblings[0].id);
    }
  }

  await invalidateTodayPlan(supabase, user.id);
  return NextResponse.json({ success: true });
}
