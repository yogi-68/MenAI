import { NextResponse } from "next/server";
import { getRedisClient } from "@/lib/redis/client";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Check = { status: "ok" | "degraded" | "down"; latencyMs?: number; detail?: string };

async function timed(fn: () => Promise<void>): Promise<Check> {
  const start = Date.now();
  try {
    await fn();
    return { status: "ok", latencyMs: Date.now() - start };
  } catch (error) {
    return {
      status: "down",
      latencyMs: Date.now() - start,
      detail: error instanceof Error ? error.name : "unknown",
    };
  }
}

/**
 * Liveness + dependency probe.
 *
 * Returns 200 only when the database is reachable. Redis being unavailable is
 * reported as `degraded` rather than failing the check, because the app is
 * designed to fall back to rebuilding context from the database.
 *
 * Deliberately terse: no versions, no connection strings, no error messages
 * beyond an exception name.
 */
export async function GET() {
  const [database, cache] = await Promise.all([
    timed(async () => {
      const db = await createServiceRoleClient();
      const { error } = await db.from("profiles").select("id", { head: true, count: "exact" }).limit(1);
      if (error) throw new Error(error.code || "query_failed");
    }),
    timed(async () => {
      const client = getRedisClient();
      if (!client) throw new Error("not_configured");
      await client.ping();
    }),
  ]);

  const healthy = database.status === "ok";

  return NextResponse.json(
    {
      status: healthy ? (cache.status === "ok" ? "ok" : "degraded") : "down",
      checks: { database, cache },
      time: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}
