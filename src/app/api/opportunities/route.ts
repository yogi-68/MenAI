import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { invalidateUserCache } from "@/lib/ai/orchestrator/cache-invalidation";
import { invalidateTodayPlan } from "@/lib/plans/daily-plan-generator";
import { scheduleUserModelRefresh } from "@/lib/user-model/synthesis-engine";

async function invalidatePlanForUser(userId: string) {
  const supabase = await createServerSupabaseClient();
  await invalidateTodayPlan(supabase, userId);
  invalidateUserCache(userId, "opportunity changed — daily plan invalidated");
}

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const status = new URL(req.url).searchParams.get("status") || "active";

  let query = supabase
    .from("opportunities")
    .select("*")
    .eq("user_id", user.id)
    .order("due_date", { ascending: true, nullsFirst: false });

  if (status !== "all") query = query.eq("status", status);

  const { data, error } = await query.limit(30);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ opportunities: data });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { title, description, lifeArea, urgency, dueDate } = body;

  if (!title?.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("opportunities")
    .insert({
      user_id: user.id,
      title: title.trim(),
      description: description?.trim() || null,
      life_area: lifeArea || "personal",
      urgency: urgency || "medium",
      due_date: dueDate || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await invalidatePlanForUser(user.id);
  scheduleUserModelRefresh(supabase, user.id);
  return NextResponse.json({ opportunity: data }, { status: 201 });
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
  if (updates.lifeArea !== undefined) mapped.life_area = updates.lifeArea;
  if (updates.urgency !== undefined) mapped.urgency = updates.urgency;
  if (updates.dueDate !== undefined) mapped.due_date = updates.dueDate;
  if (updates.status !== undefined) mapped.status = updates.status;

  const { data, error } = await supabase
    .from("opportunities")
    .update(mapped)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await invalidatePlanForUser(user.id);
  scheduleUserModelRefresh(supabase, user.id);
  return NextResponse.json({ opportunity: data });
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
    .from("opportunities")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await invalidatePlanForUser(user.id);
  scheduleUserModelRefresh(supabase, user.id);
  return NextResponse.json({ success: true });
}
