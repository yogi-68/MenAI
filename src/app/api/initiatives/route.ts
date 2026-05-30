import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { invalidateUserCache } from "@/lib/ai/orchestrator/cache-invalidation";
import { invalidateTodayPlan } from "@/lib/plans/daily-plan-generator";

async function invalidatePlanForUser(userId: string) {
  const supabase = await createServerSupabaseClient();
  await invalidateTodayPlan(supabase, userId);
  invalidateUserCache(userId, "initiative changed — daily plan invalidated");
}

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "active";

  let query = supabase
    .from("initiatives")
    .select("*, goals(title, category)")
    .eq("user_id", user.id)
    .order("target_date", { ascending: true, nullsFirst: false });

  if (status !== "all") query = query.eq("status", status);

  const { data, error } = await query.limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ initiatives: data });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { title, description, goalId, targetDate, lifeArea } = body;

  if (!title?.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("initiatives")
    .insert({
      user_id: user.id,
      goal_id: goalId || null,
      title: title.trim(),
      description: description?.trim() || null,
      target_date: targetDate || null,
      life_area: lifeArea || "personal",
    })
    .select("*, goals(title, category)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await invalidatePlanForUser(user.id);
  return NextResponse.json({ initiative: data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const mapped: Record<string, unknown> = {};
  if (updates.title !== undefined) mapped.title = updates.title;
  if (updates.description !== undefined) mapped.description = updates.description;
  if (updates.targetDate !== undefined) mapped.target_date = updates.targetDate;
  if (updates.goalId !== undefined) mapped.goal_id = updates.goalId;
  if (updates.lifeArea !== undefined) mapped.life_area = updates.lifeArea;
  if (updates.status !== undefined) mapped.status = updates.status;
  if (updates.progress !== undefined) mapped.progress = updates.progress;

  const { data, error } = await supabase
    .from("initiatives")
    .update(mapped)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*, goals(title, category)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await invalidatePlanForUser(user.id);
  return NextResponse.json({ initiative: data });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error } = await supabase
    .from("initiatives")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await invalidatePlanForUser(user.id);
  return NextResponse.json({ success: true });
}
