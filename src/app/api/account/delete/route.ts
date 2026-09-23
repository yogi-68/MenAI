import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/handler";
import { RATE_LIMITS } from "@/lib/api/rate-limit";
import { apiError } from "@/lib/api/errors";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { invalidateUserCache } from "@/lib/redis/client";

export const runtime = "nodejs";
export const maxDuration = 60;

const BodySchema = z.object({
  /** Typed confirmation, so a stray request cannot erase an account. */
  confirm: z.literal("DELETE"),
});

/**
 * Permanently delete the caller's account and everything attached to it.
 *
 * Every domain table references auth.users(id) ON DELETE CASCADE, so removing
 * the auth user removes the data. The BEFORE DELETE trigger on profiles
 * (migration 015) records per-table counts into user_deletion_log first.
 *
 * Irreversible, and deliberately so — for this category, "delete" that leaves
 * a recoverable copy is not delete.
 */
export const POST = withAuth(
  { scope: "account/delete", body: BodySchema, rateLimit: RATE_LIMITS.auth },
  async ({ user, supabase, log }) => {
    log.warn("account deletion requested", { userId: user.id });

    // Clear cached context first. If deletion then fails, the worst outcome is
    // a cold cache; doing it afterwards could leave a deleted user's context
    // resident in Redis until its TTL expired.
    await invalidateUserCache(user.id).catch(() => {});

    const admin = await createServiceRoleClient();
    const { error } = await admin.auth.admin.deleteUser(user.id);

    if (error) {
      log.error("account deletion failed", error, { userId: user.id });
      return apiError("internal", {
        message: "We couldn't delete your account. Please contact support.",
      });
    }

    await supabase.auth.signOut().catch(() => {});
    log.warn("account deleted", { userId: user.id });

    return NextResponse.json({ deleted: true });
  }
);
