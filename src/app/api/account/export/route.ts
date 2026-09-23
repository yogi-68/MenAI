import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/handler";
import { RATE_LIMITS } from "@/lib/api/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Tables exported, in the order they appear in the file.
 *
 * Every one is scoped by user_id and read through the caller's own session, so
 * RLS is the enforcement boundary here rather than this list — the list only
 * decides what is offered, not what is permitted.
 */
const EXPORTED_TABLES = [
  "profiles",
  "goals",
  "goal_milestones",
  "tasks",
  "daily_plans",
  "daily_reflections",
  "conversations",
  "messages",
  "memories",
  "mentor_memories",
  "execution_patterns",
  "identity_signals",
  "onboarding_responses",
  "onboarding_progress",
  "weekly_reviews",
  "goal_progress_snapshots",
  "commitments",
  "opportunities",
] as const;

/** Rows per table. Bounds the response for a long-lived account. */
const MAX_ROWS = 5000;

/**
 * Export everything we hold about the caller, as a single JSON download.
 *
 * Required for a product storing reflections, chat transcripts and crisis
 * events (GDPR art. 15/20, DPDP s.11). Counterpart to DELETE /api/account.
 */
export const GET = withAuth(
  { scope: "account/export", rateLimit: RATE_LIMITS.read },
  async ({ user, supabase, log }) => {
    const data: Record<string, unknown> = {};
    const skipped: string[] = [];

    for (const table of EXPORTED_TABLES) {
      const column = table === "profiles" ? "id" : "user_id";
      const { data: rows, error } = await supabase
        .from(table)
        .select("*")
        .eq(column, user.id)
        .limit(MAX_ROWS);

      if (error) {
        // A table absent from this deployment shouldn't fail the whole export.
        skipped.push(table);
        continue;
      }
      data[table] = rows ?? [];
    }

    if (skipped.length > 0) log.warn("export skipped tables", { skipped });

    const body = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        userId: user.id,
        note: `Each table is capped at ${MAX_ROWS} rows.`,
        data,
      },
      null,
      2
    );

    const filename = `mettle-export-${new Date().toISOString().slice(0, 10)}.json`;

    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  }
);
