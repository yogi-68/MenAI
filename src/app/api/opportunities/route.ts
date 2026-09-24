import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/handler";
import { apiDbError } from "@/lib/api/errors";
import { RATE_LIMITS } from "@/lib/api/rate-limit";
import { invalidateUserCache } from "@/lib/ai/orchestrator/cache-invalidation";
import { invalidateTodayPlan } from "@/lib/plans/daily-plan-generator";
import { scheduleUserModelRefresh } from "@/lib/user-model/synthesis-engine";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const Urgency = z.enum(["low", "medium", "high"]);

const QuerySchema = z.object({
  status: z.string().trim().max(30).optional(),
  id: z.string().uuid().optional(),
});

const CreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  lifeArea: z.string().trim().max(60).optional(),
  urgency: Urgency.optional(),
  dueDate: DateString.optional().nullable(),
});

const UpdateSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    lifeArea: z.string().trim().max(60).optional(),
    urgency: Urgency.optional(),
    dueDate: DateString.nullable().optional(),
    status: z.enum(["active", "done", "dismissed"]).optional(),
  })
  .refine((v) => Object.keys(v).length > 1, { message: "Nothing to update." });

/** Opportunities feed the planner, so any change invalidates today's plan. */
async function afterChange(supabase: SupabaseClient, userId: string) {
  await invalidateTodayPlan(supabase, userId);
  invalidateUserCache(userId, "opportunity changed");
  scheduleUserModelRefresh(supabase, userId);
}

export const GET = withAuth(
  { scope: "opportunities", query: QuerySchema, rateLimit: RATE_LIMITS.read },
  async ({ user, supabase, query }) => {
    let q = supabase
      .from("opportunities")
      .select("id, title, description, life_area, urgency, due_date, status, created_at")
      .eq("user_id", user.id)
      .order("due_date", { ascending: true, nullsFirst: false });

    const status = query.status ?? "active";
    if (status !== "all") q = q.eq("status", status);

    const { data, error } = await q.limit(30);
    if (error) return apiDbError("opportunities", error, { userId: user.id });
    return NextResponse.json({ opportunities: data ?? [] });
  }
);

export const POST = withAuth(
  { scope: "opportunities", body: CreateSchema, rateLimit: RATE_LIMITS.write },
  async ({ user, supabase, body }) => {
    const { data, error } = await supabase
      .from("opportunities")
      .insert({
        user_id: user.id,
        title: body.title,
        description: body.description?.trim() || null,
        life_area: body.lifeArea || "personal",
        urgency: body.urgency || "medium",
        due_date: body.dueDate || null,
      })
      .select()
      .single();

    if (error) return apiDbError("opportunities", error, { userId: user.id });

    await afterChange(supabase, user.id);
    return NextResponse.json({ opportunity: data }, { status: 201 });
  }
);

export const PATCH = withAuth(
  { scope: "opportunities", body: UpdateSchema, rateLimit: RATE_LIMITS.write },
  async ({ user, supabase, body }) => {
    // Only map fields that were actually sent, so a partial update cannot
    // blank out columns it never mentioned.
    const updates: Record<string, unknown> = {};
    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.lifeArea !== undefined) updates.life_area = body.lifeArea;
    if (body.urgency !== undefined) updates.urgency = body.urgency;
    if (body.dueDate !== undefined) updates.due_date = body.dueDate;
    if (body.status !== undefined) updates.status = body.status;

    const { data, error } = await supabase
      .from("opportunities")
      .update(updates)
      .eq("id", body.id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) return apiDbError("opportunities", error, { userId: user.id });

    await afterChange(supabase, user.id);
    return NextResponse.json({ opportunity: data });
  }
);

export const DELETE = withAuth(
  { scope: "opportunities", query: QuerySchema.required({ id: true }), rateLimit: RATE_LIMITS.write },
  async ({ user, supabase, query }) => {
    const { error } = await supabase
      .from("opportunities")
      .delete()
      .eq("id", query.id)
      .eq("user_id", user.id);

    if (error) return apiDbError("opportunities", error, { userId: user.id });

    await afterChange(supabase, user.id);
    return NextResponse.json({ success: true });
  }
);
