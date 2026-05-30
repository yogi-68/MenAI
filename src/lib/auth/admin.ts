import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";

export async function getAdminProfile(userId: string) {
  const db = await createServiceRoleClient();
  const { data } = await db
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", userId)
    .maybeSingle();
  return data;
}

export async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }

  const profile = await getAdminProfile(user.id);
  if (profile?.role !== "admin") {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }

  return { ok: true as const, user, profile };
}
