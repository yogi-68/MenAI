import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getUserModel, refreshUserModel } from "@/lib/user-model/loader";

export const runtime = "nodejs";

/** GET /api/user-model — synthesized execution profile (single source of truth) */
export async function GET(req: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const refresh = new URL(req.url).searchParams.get("refresh") === "1";

  const [model, profileRes] = await Promise.all([
    refresh ? refreshUserModel(supabase, user.id) : getUserModel(supabase, user.id),
    supabase.from("profiles").select("user_model_updated_at").eq("id", user.id).maybeSingle(),
  ]);

  const updatedAt =
    profileRes.data?.user_model_updated_at ?? model.synthesizedAt ?? null;

  return NextResponse.json({ userModel: model, updatedAt });
}

/** POST /api/user-model — force re-synthesis after data changes */
export async function POST() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const model = await refreshUserModel(supabase, user.id);
  const { data: profile } = await supabase
    .from("profiles")
    .select("user_model_updated_at")
    .eq("id", user.id)
    .maybeSingle();

  return NextResponse.json({
    userModel: model,
    updatedAt: profile?.user_model_updated_at ?? model.synthesizedAt ?? null,
  });
}
