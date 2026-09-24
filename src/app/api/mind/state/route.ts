import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/handler";
import { apiError } from "@/lib/api/errors";
import { RATE_LIMITS } from "@/lib/api/rate-limit";
import {
  getRecentCheckins,
  getTodayCheckin,
  recordStateCheckin,
  summarizeState,
} from "@/lib/mind/state-checkins";
import { STATE_SCALE, STATE_SIGNALS } from "@/lib/mind/state-scale";
import { resetsForBand } from "@/lib/mind/resets";
import { invalidateUserCache } from "@/lib/ai/orchestrator/cache-invalidation";
import { invalidateTodayPlan } from "@/lib/plans/daily-plan-generator";
import { trackProductEvent, trackProductEventOnce } from "@/lib/analytics/track-event";

export const runtime = "nodejs";

const BodySchema = z.object({
  score: z.number().int().min(1).max(10),
  signals: z.array(z.string().trim().max(40)).max(6).optional(),
  note: z.string().trim().max(1000).nullable().optional(),
});

const QuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).optional(),
});

/** Today's reading plus the recent trend, and the scale to render. */
export const GET = withAuth(
  { scope: "mind/state", query: QuerySchema, rateLimit: RATE_LIMITS.read },
  async ({ user, supabase, query }) => {
    const days = query.days ?? 30;
    const checkins = await getRecentCheckins(supabase, user.id, days);
    const summary = summarizeState(checkins);

    return NextResponse.json({
      today: summary.today,
      summary: {
        average: summary.average,
        trend: summary.trend,
        commonSignals: summary.commonSignals,
        consistency: summary.consistency,
        suggestedTaskLoad: summary.suggestedTaskLoad,
      },
      history: checkins.map((c) => ({
        date: c.checkinDate,
        score: c.score,
        band: c.band,
        signals: c.signals,
      })),
      scale: STATE_SCALE,
      availableSignals: STATE_SIGNALS,
    });
  }
);

/**
 * Record today's state.
 *
 * Re-submitting replaces the day's reading. The plan is invalidated because
 * capacity is an input to it: a day rated 2/10 should not be handed the same
 * three tasks as a day rated 9/10.
 */
export const POST = withAuth(
  { scope: "mind/state", body: BodySchema, rateLimit: RATE_LIMITS.write },
  async ({ user, supabase, body, log }) => {
    const existing = await getTodayCheckin(supabase, user.id);

    const checkin = await recordStateCheckin(supabase, user.id, {
      score: body.score,
      signals: body.signals ?? [],
      note: body.note ?? null,
    });

    if (!checkin) {
      log.error("state check-in write failed", undefined, { userId: user.id });
      return apiError("internal", { message: "We couldn't save that. Try again." });
    }

    await invalidateTodayPlan(supabase, user.id).catch(() => {});
    invalidateUserCache(user.id, "state check-in recorded");

    if (!existing) {
      trackProductEventOnce(user.id, "first_state_checkin").catch(() => {});
    }
    trackProductEvent(user.id, "state_checkin", {
      score: body.score,
      band: checkin.band,
    }).catch(() => {});

    return NextResponse.json(
      {
        checkin,
        // A low reading is exactly when a reset is worth offering.
        suggestedResets: checkin.band === "depleted" || checkin.band === "low"
          ? resetsForBand(checkin.band).slice(0, 2)
          : [],
      },
      { status: existing ? 200 : 201 }
    );
  }
);
