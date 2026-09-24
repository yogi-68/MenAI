import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/handler";
import { apiDbError } from "@/lib/api/errors";
import { RATE_LIMITS } from "@/lib/api/rate-limit";
import { invalidateUserCache } from "@/lib/ai/orchestrator/cache-invalidation";
import { trackProductEventOnce, trackProductEvent } from "@/lib/analytics/track-event";
import { ingestReflectionSignals } from "@/lib/mentor/reflection-extraction";
import { runMemoryMaintenance } from "@/lib/mentor/memory-aging";
import { scheduleUserModelRefresh } from "@/lib/user-model/synthesis-engine";

export const runtime = "nodejs";

/** YYYY-MM-DD. */
const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

const QuerySchema = z.object({
  date: DateString.optional(),
});

const BodySchema = z.object({
  movedForward: z.string().trim().min(1, "Tell us what moved forward.").max(2000),
  blockedBy: z.string().trim().min(1, "Tell us what blocked you.").max(2000),
  tomorrowContext: z.string().trim().min(1, "Tell us about tomorrow.").max(2000),
  reflectionDate: DateString.optional(),
});

function today(): string {
  return new Date().toISOString().split("T")[0];
}

export const GET = withAuth(
  { scope: "reflections", query: QuerySchema, rateLimit: RATE_LIMITS.read },
  async ({ user, supabase, query }) => {
    const { data, error } = await supabase
      .from("daily_reflections")
      .select("*")
      .eq("user_id", user.id)
      .eq("reflection_date", query.date ?? today())
      .maybeSingle();

    if (error) return apiDbError("reflections", error, { userId: user.id });
    return NextResponse.json({ reflection: data });
  }
);

export const POST = withAuth(
  { scope: "reflections", body: BodySchema, rateLimit: RATE_LIMITS.write },
  async ({ user, supabase, body }) => {
    const date = body.reflectionDate ?? today();

    const { data, error } = await supabase
      .from("daily_reflections")
      .upsert(
        {
          user_id: user.id,
          reflection_date: date,
          moved_forward: body.movedForward,
          blocked_by: body.blockedBy,
          tomorrow_context: body.tomorrowContext,
        },
        { onConflict: "user_id,reflection_date" }
      )
      .select()
      .single();

    if (error) return apiDbError("reflections", error, { userId: user.id });

    invalidateUserCache(user.id, "daily reflection saved");
    scheduleUserModelRefresh(supabase, user.id);
    trackProductEventOnce(user.id, "reflection_submitted").catch(() => {});
    trackProductEvent(user.id, "reflection_submitted", { date }).catch(() => {});

    await runMemoryMaintenance(supabase, user.id);
    await ingestReflectionSignals(supabase, user.id, {
      movedForward: body.movedForward,
      blockedBy: body.blockedBy,
      tomorrowContext: body.tomorrowContext,
    });

    return NextResponse.json({ reflection: data }, { status: 201 });
  }
);
