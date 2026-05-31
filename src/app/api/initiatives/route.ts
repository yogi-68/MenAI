import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { invalidateUserCache } from "@/lib/ai/orchestrator/cache-invalidation";
import { scheduleUserModelRefresh } from "@/lib/user-model/synthesis-engine";
import { invalidateTodayPlan } from "@/lib/plans/daily-plan-generator";
import { trackProductEventOnce } from "@/lib/analytics/track-event";
import { assertCanActivateInitiative } from "@/lib/ai/memory-confidence";
import { MAX_ACTIVE_INITIATIVES } from "@/lib/product/constants";
import { validateInitiativeTitle } from "@/lib/initiatives/title-quality";
import { generateMilestonesForInitiative } from "@/lib/plans/milestone-generator";

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
    .select("*, goals(title, category), initiative_milestones(id, title, sort_order, status)")
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

  const titleCheck = validateInitiativeTitle(title.trim());
  if (!titleCheck.valid) {
    return NextResponse.json({ error: titleCheck.error }, { status: 400 });
  }
  if (!targetDate) {
    return NextResponse.json(
      { error: "targetDate is required — initiatives need a deadline for reliable planning" },
      { status: 400 }
    );
  }

  const gate = await assertCanActivateInitiative(supabase, user.id);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: 409 });

  const { data, error } = await supabase
    .from("initiatives")
    .insert({
      user_id: user.id,
      goal_id: goalId || null,
      title: titleCheck.title,
      description: description?.trim() || null,
      target_date: targetDate || null,
      life_area: lifeArea || "personal",
    })
    .select("*, goals(title, category)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await generateMilestonesForInitiative(
    supabase,
    user.id,
    data.id,
    data.title,
    data.description,
    data.life_area || "personal"
  );

  await invalidatePlanForUser(user.id);
  scheduleUserModelRefresh(supabase, user.id);
  trackProductEventOnce(user.id, "first_initiative_created").catch(() => {});
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
  if (updates.title !== undefined) {
    const titleCheck = validateInitiativeTitle(String(updates.title).trim());
    if (!titleCheck.valid) {
      return NextResponse.json({ error: titleCheck.error }, { status: 400 });
    }
    mapped.title = titleCheck.title;
  }
  if (updates.description !== undefined) mapped.description = updates.description;
  if (updates.targetDate !== undefined) mapped.target_date = updates.targetDate;
  if (updates.goalId !== undefined) mapped.goal_id = updates.goalId;
  if (updates.lifeArea !== undefined) mapped.life_area = updates.lifeArea;
  if (updates.status !== undefined) mapped.status = updates.status;
  if (updates.progress !== undefined) mapped.progress = updates.progress;

  if (updates.status === "active") {
    const { data: current } = await supabase
      .from("initiatives")
      .select("status")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();
    if (current?.status !== "active") {
      const gate = await assertCanActivateInitiative(supabase, user.id);
      if (!gate.ok) {
        return NextResponse.json(
          { error: gate.error, maxActive: MAX_ACTIVE_INITIATIVES },
          { status: 409 }
        );
      }
    }
  }

  const { data, error } = await supabase
    .from("initiatives")
    .update(mapped)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*, goals(title, category)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await invalidatePlanForUser(user.id);
  scheduleUserModelRefresh(supabase, user.id);
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
  scheduleUserModelRefresh(supabase, user.id);
  return NextResponse.json({ success: true });
}
