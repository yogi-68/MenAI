import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/handler";
import { apiError } from "@/lib/api/errors";
import { RATE_LIMITS } from "@/lib/api/rate-limit";
import { RESETS, resetById, resetsForBand } from "@/lib/mind/resets";
import { getTodayCheckin } from "@/lib/mind/state-checkins";
import type { StateBand } from "@/lib/mind/state-scale";

export const runtime = "nodejs";

const QuerySchema = z.object({
  id: z.string().trim().max(40).optional(),
  band: z.enum(["depleted", "low", "steady", "strong"]).optional(),
});

/**
 * The reset library.
 *
 * With no filter, returns everything. With a band — or, failing that, today's
 * recorded state — returns the ones suited to how the user actually is.
 */
export const GET = withAuth(
  { scope: "mind/resets", query: QuerySchema, rateLimit: RATE_LIMITS.read },
  async ({ user, supabase, query }) => {
    if (query.id) {
      const reset = resetById(query.id);
      if (!reset) return apiError("not_found", { message: "No such reset." });
      return NextResponse.json({ reset });
    }

    let band: StateBand | null = query.band ?? null;
    if (!band) {
      const today = await getTodayCheckin(supabase, user.id);
      band = today?.band ?? null;
    }

    return NextResponse.json({
      resets: band ? resetsForBand(band) : RESETS,
      band,
    });
  }
);
