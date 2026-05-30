import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { invalidateTodayPlan } from "@/lib/plans/daily-plan-generator";
import { invalidateUserCache } from "@/lib/ai/orchestrator/cache-invalidation";
import { scheduleUserModelRefresh } from "@/lib/user-model/synthesis-engine";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("current_focus_initiative_id, current_focus_until")
    .eq("id", user.id)
    .single();

  if (!profile?.current_focus_initiative_id) {
    return NextResponse.json({ focus: null });
  }

  const { data: initiative } = await supabase
    .from("initiatives")
    .select("id, title, target_date, life_area, status")
    .eq("id", profile.current_focus_initiative_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!initiative || initiative.status !== "active") {
    return NextResponse.json({ focus: null });
  }

  return NextResponse.json({
    focus: {
      initiativeId: initiative.id,
      title: initiative.title,
      until: profile.current_focus_until || initiative.target_date,
      lifeArea: initiative.life_area,
    },
  });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { initiativeId, until } = body as { initiativeId: string | null; until?: string };

  if (initiativeId === null) {
    await supabase
      .from("profiles")
      .update({ current_focus_initiative_id: null, current_focus_until: null })
      .eq("id", user.id);
    await invalidateTodayPlan(supabase, user.id);
    scheduleUserModelRefresh(supabase, user.id);
    return NextResponse.json({ success: true, focus: null });
  }

  const { data: initiative } = await supabase
    .from("initiatives")
    .select("id, title, target_date")
    .eq("id", initiativeId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();

  if (!initiative) {
    return NextResponse.json({ error: "Active initiative not found" }, { status: 404 });
  }

  const focusUntil = until || initiative.target_date;

  await supabase
    .from("profiles")
    .update({
      current_focus_initiative_id: initiativeId,
      current_focus_until: focusUntil,
    })
    .eq("id", user.id);

  await invalidateTodayPlan(supabase, user.id);
  invalidateUserCache(user.id, "current focus changed");
  scheduleUserModelRefresh(supabase, user.id);

  return NextResponse.json({
    success: true,
    focus: {
      initiativeId,
      title: initiative.title,
      until: focusUntil,
    },
  });
}
