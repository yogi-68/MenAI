import { createServiceRoleClient } from "@/lib/supabase/server";

export type ProductEventName =
  | "signup"
  | "onboarding_completed"
  | "first_initiative_created"
  | "first_plan_generated"
  | "task_completed"
  | "reflection_submitted"
  | "daily_return"
  | "suggestion_shown"
  | "suggestion_accepted"
  | "suggestion_dismissed"
  | "who_am_i_asked"
  | "first_state_checkin"
  | "state_checkin"
  | "reset_completed";

/** Server-side product analytics — invisible to regular users. */
export async function trackProductEvent(
  userId: string,
  eventName: ProductEventName,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  try {
    const db = await createServiceRoleClient();
    await db.from("product_events").insert({
      user_id: userId,
      event_name: eventName,
      metadata,
    });
  } catch (err) {
    console.error("[analytics]", eventName, err);
  }
}

/** Fire once per user for milestone events. */
export async function trackProductEventOnce(
  userId: string,
  eventName: ProductEventName,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  try {
    const db = await createServiceRoleClient();
    const { count } = await db
      .from("product_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("event_name", eventName);

    if ((count ?? 0) === 0) {
      await db.from("product_events").insert({
        user_id: userId,
        event_name: eventName,
        metadata,
      });
    }
  } catch (err) {
    console.error("[analytics-once]", eventName, err);
  }
}

/** Once per user per calendar day — for retention tracking. */
export async function trackDailyReturn(userId: string): Promise<void> {
  try {
    const db = await createServiceRoleClient();
    const today = new Date().toISOString().split("T")[0];
    const { count } = await db
      .from("product_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("event_name", "daily_return")
      .contains("metadata", { date: today });

    if ((count ?? 0) > 0) return;

    await db.from("product_events").insert({
      user_id: userId,
      event_name: "daily_return",
      metadata: { date: today },
    });
  } catch (err) {
    console.error("[analytics-daily-return]", err);
  }
}
