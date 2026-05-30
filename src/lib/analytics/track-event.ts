import { createServiceRoleClient } from "@/lib/supabase/server";

export type ProductEventName =
  | "signup"
  | "onboarding_completed"
  | "first_initiative_created"
  | "first_plan_generated"
  | "task_completed"
  | "reflection_submitted"
  | "daily_return";

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
