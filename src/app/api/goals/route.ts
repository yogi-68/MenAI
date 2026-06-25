import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { invalidateUserCache } from "@/lib/ai/orchestrator/cache-invalidation";
import { scheduleUserModelRefresh } from "@/lib/user-model/synthesis-engine";
import { invalidateTodayPlan } from "@/lib/plans/daily-plan-generator";
import { trackProductEventOnce } from "@/lib/analytics/track-event";
import { assertCanActivateGoal } from "@/lib/ai/memory-confidence";
import { MAX_ACTIVE_GOALS } from "@/lib/product/constants";
import { assessGoalQuality } from "@/lib/goals/goal-quality-gate";
import { generateMilestonesForGoal } from "@/lib/plans/milestone-generator";
import { fetchActiveExecutionGoals } from "@/lib/goals/active-goals";

async function invalidatePlanForUser(userId: string) {
  const supabase = await createServerSupabaseClient();
  await invalidateTodayPlan(supabase, userId);
  invalidateUserCache(userId, "goal changed — daily plan invalidated");
}

function isExecutionRequest(body: Record<string, unknown>): boolean {
  if (body.goalKind === "execution") return true;
  if (body.goalKind === "direction") return false;
  return Boolean(body.targetDate && !body.category);
}

const EXECUTION_SELECT =
  "*, parent_goal:parent_goal_id(title, category), goal_milestones(id, title, sort_order, status)";

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "active";
  const category = searchParams.get("category");
  const goalKind = searchParams.get("goal_kind");

  let query = supabase.from("goals").select("*").eq("user_id", user.id);

  if (goalKind === "execution") {
    query = supabase
      .from("goals")
      .select(EXECUTION_SELECT)
      .eq("user_id", user.id)
      .eq("goal_kind", "execution")
      .order("target_date", { ascending: true, nullsFirst: false });
  } else if (goalKind === "direction") {
    query = query.eq("goal_kind", "direction").order("created_at", { ascending: false });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  if (status !== "all") query = query.eq("status", status);
  if (category) query = query.eq("category", category);

  const { data, error } = await query.limit(50);
  if (error && goalKind !== "execution") {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let goals = data || [];
  if (goalKind === "execution" && (error || goals.length === 0)) {
    const fallback = await fetchActiveExecutionGoals(supabase, user.id, 50);
    goals = fallback as typeof goals;
  } else if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const executionGoals = goals.filter(
    (g) => (g as { goal_kind?: string }).goal_kind === "execution" || (g as { target_date?: string }).target_date
  );

  return NextResponse.json({
    goals,
    ...(goalKind === "execution" || executionGoals.length > 0
      ? { initiatives: goalKind === "execution" ? goals : executionGoals }
      : {}),
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    title,
    description,
    category,
    priority,
    targetDate,
    parentGoalId,
    goalId,
    lifeArea,
    goalKind,
  } = body;

  if (!title?.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  if (isExecutionRequest(body)) {
    const titleCheck = assessGoalQuality(title.trim());
    if (!titleCheck.valid) {
      return NextResponse.json(
        {
          error: titleCheck.message,
          kind: titleCheck.kind,
          suggestions: titleCheck.suggestions,
        },
        { status: 400 }
      );
    }
    if (titleCheck.needsSharpening) {
      return NextResponse.json(
        {
          error: titleCheck.message,
          needsSharpening: true,
          sharpenPrompt: titleCheck.sharpenPrompt,
          sharpenOptions: titleCheck.sharpenOptions,
        },
        { status: 422 }
      );
    }
    if (!targetDate) {
      return NextResponse.json(
        { error: "targetDate is required — execution goals need a deadline for reliable planning" },
        { status: 400 }
      );
    }

    const gate = await assertCanActivateGoal(supabase, user.id);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: 409 });

    const { data, error } = await supabase
      .from("goals")
      .insert({
        user_id: user.id,
        title: titleCheck.title,
        description: description?.trim() || null,
        target_date: targetDate,
        life_area: lifeArea || "personal",
        parent_goal_id: parentGoalId || goalId || null,
        goal_kind: "execution",
        category: category || lifeArea || "personal",
        priority: priority || "medium",
        status: "active",
      })
      .select(EXECUTION_SELECT)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await generateMilestonesForGoal(
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

    return NextResponse.json({ goal: data, initiative: data }, { status: 201 });
  }

  if (!category) {
    return NextResponse.json({ error: "title and category are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("goals")
    .insert({
      user_id: user.id,
      title: title.trim(),
      description: description || null,
      category,
      priority: priority || "medium",
      target_date: targetDate || null,
      goal_kind: goalKind === "execution" ? "execution" : "direction",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  invalidateUserCache(user.id, "goal created");
  scheduleUserModelRefresh(supabase, user.id);

  return NextResponse.json({ goal: data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, goalStage, initiativeStage, parentGoalId, goalId, ...updates } = body;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { data: existing } = await supabase
    .from("goals")
    .select("goal_kind, status")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  const isExecution = existing?.goal_kind === "execution";
  const mapped: Record<string, unknown> = {};

  if (updates.title !== undefined) {
    if (isExecution) {
      const titleCheck = assessGoalQuality(String(updates.title).trim());
      if (!titleCheck.valid) {
        return NextResponse.json(
          { error: titleCheck.message, suggestions: titleCheck.suggestions },
          { status: 400 }
        );
      }
      if (titleCheck.needsSharpening) {
        return NextResponse.json(
          {
            error: titleCheck.message,
            needsSharpening: true,
            sharpenPrompt: titleCheck.sharpenPrompt,
            sharpenOptions: titleCheck.sharpenOptions,
          },
          { status: 422 }
        );
      }
      mapped.title = titleCheck.title;
    } else {
      mapped.title = String(updates.title).trim();
    }
  }
  if (updates.description !== undefined) mapped.description = updates.description;
  if (updates.targetDate !== undefined) mapped.target_date = updates.targetDate;
  if (parentGoalId !== undefined || goalId !== undefined) {
    mapped.parent_goal_id = parentGoalId ?? goalId ?? null;
  }
  if (updates.lifeArea !== undefined) mapped.life_area = updates.lifeArea;
  if (updates.status !== undefined) mapped.status = updates.status;
  if (updates.progress !== undefined) mapped.progress = updates.progress;
  if (goalStage !== undefined || initiativeStage !== undefined) {
    mapped.goal_stage = goalStage ?? initiativeStage;
  }
  if (updates.category !== undefined) mapped.category = updates.category;
  if (updates.priority !== undefined) mapped.priority = updates.priority;

  if (updates.status === "active" && isExecution) {
    if (existing?.status !== "active") {
      const gate = await assertCanActivateGoal(supabase, user.id);
      if (!gate.ok) {
        return NextResponse.json(
          { error: gate.error, maxActive: MAX_ACTIVE_GOALS },
          { status: 409 }
        );
      }
    }
  }

  const selectClause = isExecution ? EXECUTION_SELECT : "*";
  const { data, error } = await supabase
    .from("goals")
    .update(mapped)
    .eq("id", id)
    .eq("user_id", user.id)
    .select(selectClause)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (isExecution) {
    await invalidatePlanForUser(user.id);
  } else {
    invalidateUserCache(user.id, "goal updated");
  }
  scheduleUserModelRefresh(supabase, user.id);

  return NextResponse.json(
    isExecution ? { goal: data, initiative: data } : { goal: data }
  );
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { data: existing } = await supabase
    .from("goals")
    .select("goal_kind")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  const { error } = await supabase.from("goals").delete().eq("id", id).eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (existing?.goal_kind === "execution") {
    await invalidatePlanForUser(user.id);
  } else {
    invalidateUserCache(user.id, "goal deleted");
  }
  scheduleUserModelRefresh(supabase, user.id);

  return NextResponse.json({ success: true });
}
