import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserModel } from "@/lib/user-model/types";
import { USER_MODEL_VERSION } from "@/lib/user-model/types";
import { synthesizeUserModel } from "@/lib/user-model/synthesis-engine";

const DEFAULT_MAX_AGE_MS = 5 * 60_000;

function isValidUserModel(raw: unknown): raw is UserModel {
  if (!raw || typeof raw !== "object") return false;
  const m = raw as UserModel;
  return m.version === USER_MODEL_VERSION && typeof m.synthesizedAt === "string";
}

export async function getUserModel(
  supabase: SupabaseClient,
  userId: string,
  options?: { refresh?: boolean; maxAgeMs?: number }
): Promise<UserModel> {
  const maxAgeMs = options?.maxAgeMs ?? DEFAULT_MAX_AGE_MS;

  if (!options?.refresh) {
    const { data } = await supabase
      .from("profiles")
      .select("user_model, user_model_updated_at")
      .eq("id", userId)
      .maybeSingle();

    if (isValidUserModel(data?.user_model) && data.user_model_updated_at) {
      const age = Date.now() - new Date(data.user_model_updated_at).getTime();
      if (age < maxAgeMs) {
        return data.user_model;
      }
    }
  }

  return synthesizeUserModel(supabase, userId);
}

export async function refreshUserModel(
  supabase: SupabaseClient,
  userId: string
): Promise<UserModel> {
  return synthesizeUserModel(supabase, userId);
}
