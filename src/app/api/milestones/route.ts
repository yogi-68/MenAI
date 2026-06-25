import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { regenerateMilestonesIfAbstract } from "@/lib/plans/milestone-generator";
import { invalidateTodayPlan } from "@/lib/plans/daily-plan-generator";

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const initiativeId = new URL(req.url).searchParams.get("initiativeId");

  let query = supabase
    .from("goal_milestones")
    .select("*")
    .eq("user_id", user.id)
    .order("sort_order", { ascending: true });

  if (initiativeId) query = query.eq("goal_id", initiativeId);

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
    .from("goal_milestones")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("goal_id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (status === "completed" && milestone?.goal_id) {
    const { data: siblings } = await supabase
      .from("goal_milestones")
      .select("id, sort_order")
      .eq("goal_id", milestone.goal_id)
      .eq("status", "pending")
      .order("sort_order", { ascending: true })
      .limit(1);

    if (siblings?.[0]) {
      await supabase
        .from("goal_milestones")
        .update({ status: "in_progress" })
        .eq("id", siblings[0].id);
    }
  }

  await invalidateTodayPlan(supabase, user.id);
  return NextResponse.json({ success: true });
}

/** Regenerate abstract milestones into concrete, actionable steps. */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { initiativeId } = body as { initiativeId?: string };
  if (!initiativeId) {
    return NextResponse.json({ error: "initiativeId required" }, { status: 400 });
  }

  const { data: initiative } = await supabase
    .from("goals")
    .select("id, title, description, life_area")
    .eq("id", initiativeId)
    .eq("user_id", user.id)
    .eq("goal_kind", "execution")
    .single();

  if (!initiative) {
    return NextResponse.json({ error: "Initiative not found" }, { status: 404 });
  }

  const updated = await regenerateMilestonesIfAbstract(
    supabase,
    user.id,
    initiative.id,
    initiative.title,
    initiative.description,
    initiative.life_area
  );

  if (!updated) {
    return NextResponse.json({ regenerated: false, message: "Milestones already look concrete" });
  }

  await invalidateTodayPlan(supabase, user.id);
  return NextResponse.json({ regenerated: true });
}
