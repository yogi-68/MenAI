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
  const model = refresh
    ? await refreshUserModel(supabase, user.id)
    : await getUserModel(supabase, user.id);

  return NextResponse.json({ userModel: model });
}

/** POST /api/user-model — force re-synthesis after data changes */
export async function POST() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const model = await refreshUserModel(supabase, user.id);
  return NextResponse.json({ userModel: model });
}
